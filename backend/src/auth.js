const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { sendVerificationEmail, loadConfig } = require('./email');

const router = express.Router();

// Change password for authenticated user
router.post('/change-password', async (req, res) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'current password incorrect' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, payload.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(401).json({ error: 'invalid token' }); }
});

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: '用户名已存在' });

    const hash = await bcrypt.hash(password, 10);

    // Do not auto-promote registrants to admin. Admins should be created via bootstrap or promoted by an existing admin.
    const isAdmin = 0;

    // Check email verification config
    const cfg = require('./email').loadConfig() || {};
    const requireVerification = !!cfg.enableVerification;

    if (requireVerification) {
      // create unverified account and send verification email
      const token = uuidv4();
      const info = await db.run('INSERT INTO users (username, password_hash, email, verified, verification_token, is_admin) VALUES (?, ?, ?, 0, ?, ?)', [username, hash, email || null, token, isAdmin]);
      const userId = info.lastInsertRowid;
      if (cfg && cfg.host && email) {
        try { await sendVerificationEmail(email, token, req.protocol + '://' + req.get('host')); } catch (e) { console.error('send mail failed', e); }
      }
      const jwtToken = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({ token: jwtToken, verificationSent: !!(cfg && cfg.host && email) });
    } else {
      // register and mark verified
      const info = await db.run('INSERT INTO users (username, password_hash, email, verified, is_admin) VALUES (?, ?, ?, 1, ?)', [username, hash, email || null, isAdmin]);
      const userId = info.lastInsertRowid;
      const jwtToken = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ token: jwtToken });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

    const user = await db.get('SELECT id, password_hash, is_admin FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
    // enforce verification if enabled and not admin
    try {
      const cfg = require('./email').loadConfig() || {};
      const requireVerification = !!cfg.enableVerification;
      if (requireVerification && !user.is_admin) {
        const fresh = await db.get('SELECT verified FROM users WHERE id = ?', [user.id]);
        if (!fresh || !fresh.verified) return res.status(403).json({ error: '邮箱未验证' });
      }
    } catch (e) { console.error('verify check failed', e); }

    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.get('/verify', async (req, res) => {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) return res.status(400).send('Missing token');
    console.log('Attempt verify token=', token);
    const user = await db.get('SELECT id, verification_token FROM users WHERE verification_token = ?', [token]);
    if (!user) return res.status(404).send('Token not found');
    await db.run('UPDATE users SET verified = 1, verification_token = NULL WHERE id = ?', [user.id]);
    console.log('User verified id=', user.id);
    // respond with JSON to make it easier for programmatic clients
    res.json({ ok: true, message: 'Email verified. You can now login.' });
  } catch (e) {
    console.error(e); res.status(500).send('Server error');
  }
});

router.post('/resend', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const user = await db.get('SELECT id, verification_token FROM users WHERE email = ?', [email]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    const token = user.verification_token || uuidv4();
    await db.run('UPDATE users SET verification_token = ? WHERE id = ?', [token, user.id]);
    try { await sendVerificationEmail(email, token, req.protocol + '://' + req.get('host')); } catch (e) { console.error(e); }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Profile endpoint
router.get('/me', async (req, res) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    const user = await db.get('SELECT id, username, email, verified, is_admin, is_root FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ id: user.id, username: user.username, email: user.email, verified: !!user.verified, is_admin: !!user.is_admin, is_root: !!user.is_root });
  } catch (e) { return res.status(401).json({ error: 'invalid token' }); }
});

// Delete account (self). Admin accounts cannot be deleted via this endpoint.
router.delete('/delete', async (req, res) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    const user = await db.get('SELECT id, is_admin FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.is_admin) return res.status(403).json({ error: 'admin account cannot be deleted' });

    // Delete user's records then user row
    await db.run('DELETE FROM records WHERE user_id = ?', [user.id]);
    await db.run('DELETE FROM users WHERE id = ?', [user.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(401).json({ error: 'invalid token' }); }
});

module.exports = router;

// Public config endpoint (expose whether email verification is required)
router.get('/config', (req, res) => {
  try {
    const cfg = require('./email').loadConfig() || {};
    res.json({ enableVerification: !!cfg.enableVerification });
  } catch (e) {
    console.error('config read failed', e);
    res.json({ enableVerification: false });
  }
});
