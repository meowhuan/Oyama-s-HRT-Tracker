const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { sendVerificationEmail, loadConfig } = require('./email');
const { loadAuthConfig } = require('./auth_config');
const speakeasy = require('speakeasy');

const router = express.Router();

const ADMIN_LOGIN_KEY = process.env.ADMIN_LOGIN_KEY || '';
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const ADMIN_FAIL_MAX = 3;
const USER_FAIL_MAX = 5;
const ADMIN_LOCK_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;
const ADMIN_RATE_MAX = 10;
const rateStore = new Map();

const getTokenPayload = (req) => {
  const header = req.headers['authorization'];
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2) return null;
  try {
    return jwt.verify(parts[1], JWT_SECRET);
  } catch (e) {
    return null;
  }
};

const getClientIp = (req) => {
  const xfwd = (req.headers['x-forwarded-for'] || '').toString();
  const ip = xfwd.split(',')[0].trim();
  return ip || req.socket?.remoteAddress || 'unknown';
};

const checkRateLimit = (key, max) => {
  const now = Date.now();
  const existing = rateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
};

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
    const cfg = loadConfig() || {};
    const authCfg = loadAuthConfig();
    const requireVerification = authCfg.configured ? !!authCfg.enableVerification : !!cfg.enableVerification;

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
    const { username, password, adminKey, otp } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

    const user = await db.get('SELECT id, password_hash, is_admin, login_fail_count, last_failed_at, login_lock_until, totp_secret, totp_enabled FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const ip = getClientIp(req);
    const rateKey = `${username}::${ip}`;
    const okRate = checkRateLimit(rateKey, user.is_admin ? ADMIN_RATE_MAX : RATE_MAX);
    if (!okRate) return res.status(429).json({ error: '请求过于频繁，请稍后再试' });

    const now = Date.now();
    if (user.login_lock_until && Number(user.login_lock_until) > now) {
      return res.status(429).json({ error: '账户已被锁定，请稍后再试' });
    }

    const recordLoginFail = async () => {
      const maxFail = user.is_admin ? ADMIN_FAIL_MAX : USER_FAIL_MAX;
      const lockMs = user.is_admin ? ADMIN_LOCK_MS : LOCK_MS;
      const lastFailedAt = user.last_failed_at ? Number(user.last_failed_at) : 0;
      const prevCount = (lastFailedAt && now - lastFailedAt <= FAIL_WINDOW_MS) ? Number(user.login_fail_count || 0) : 0;
      const nextCount = prevCount + 1;
      const lockUntil = nextCount >= maxFail ? now + lockMs : null;
      await db.run(
        'UPDATE users SET login_fail_count = ?, last_failed_at = ?, login_lock_until = ? WHERE id = ?',
        [nextCount, now, lockUntil, user.id]
      );
    };

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await recordLoginFail();
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    // enforce verification if enabled and not admin
    try {
      const authCfg = loadAuthConfig();
      const cfg = loadConfig() || {};
      const requireVerification = authCfg.configured ? !!authCfg.enableVerification : !!cfg.enableVerification;
      if (requireVerification && !user.is_admin) {
        const fresh = await db.get('SELECT verified FROM users WHERE id = ?', [user.id]);
        if (!fresh || !fresh.verified) return res.status(403).json({ error: '邮箱未验证' });
      }
      if (authCfg.noVerification && user.is_admin) {
        if (!ADMIN_LOGIN_KEY) return res.status(503).json({ error: '管理员登录密钥未配置' });
        if (!adminKey || adminKey !== ADMIN_LOGIN_KEY) { await recordLoginFail(); return res.status(403).json({ error: '管理员登录需要密钥' }); }
      }
      if (authCfg.enable2FA) {
        if (user.is_admin) {
          if (!user.totp_enabled || !user.totp_secret) return res.status(403).json({ error: '管理员需要先绑定 2FA' });
          const okOtp = !!otp && speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(otp), window: 1 });
          if (!okOtp) { await recordLoginFail(); return res.status(403).json({ error: '2FA 验证码错误' }); }
        } else if (user.totp_enabled && user.totp_secret) {
          const okOtp = !!otp && speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(otp), window: 1 });
          if (!okOtp) { await recordLoginFail(); return res.status(403).json({ error: '2FA 验证码错误' }); }
        }
      }
    } catch (e) { console.error('verify check failed', e); }

    // reset lock state on successful login
    await db.run('UPDATE users SET login_fail_count = 0, last_failed_at = NULL, login_lock_until = NULL WHERE id = ?', [user.id]);

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
    const user = await db.get('SELECT id, username, email, verified, is_admin, is_root, totp_enabled FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json({ id: user.id, username: user.username, email: user.email, verified: !!user.verified, is_admin: !!user.is_admin, is_root: !!user.is_root, totp_enabled: !!user.totp_enabled });
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
    const cfg = loadConfig() || {};
    const authCfg = loadAuthConfig();
    const enableVerification = authCfg.configured ? !!authCfg.enableVerification : !!cfg.enableVerification;
    res.json({ enableVerification, enable2FA: !!authCfg.enable2FA, noVerification: !!authCfg.noVerification });
  } catch (e) {
    console.error('config read failed', e);
    res.json({ enableVerification: false, enable2FA: false, noVerification: false });
  }
});

// 2FA TOTP setup
router.post('/totp/setup', async (req, res) => {
  const payload = getTokenPayload(req);
  if (!payload) return res.status(401).json({ error: 'no auth' });
  try {
    const user = await db.get('SELECT id, username, totp_enabled FROM users WHERE id = ?', [payload.id]);
    if (!user) return res.status(404).json({ error: 'user not found' });
    if (user.totp_enabled) return res.status(400).json({ error: '2FA 已启用，如需重新绑定请先关闭' });
    const secret = speakeasy.generateSecret({ length: 20, name: `HRT Tracker (${user.username})` });
    await db.run('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [secret.base32, user.id]);
    res.json({ ok: true, secret: secret.base32, otpauthUrl: secret.otpauth_url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/totp/enable', async (req, res) => {
  const payload = getTokenPayload(req);
  if (!payload) return res.status(401).json({ error: 'no auth' });
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token required' });
    const user = await db.get('SELECT id, totp_secret FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.totp_secret) return res.status(400).json({ error: '请先完成 2FA 设置' });
    const ok = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(token), window: 1 });
    if (!ok) return res.status(400).json({ error: '验证码错误' });
    await db.run('UPDATE users SET totp_enabled = 1 WHERE id = ?', [user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/totp/disable', async (req, res) => {
  const payload = getTokenPayload(req);
  if (!payload) return res.status(401).json({ error: 'no auth' });
  try {
    const { currentPassword, token } = req.body || {};
    if (!currentPassword || !token) return res.status(400).json({ error: 'currentPassword and token required' });
    const user = await db.get('SELECT id, password_hash, totp_secret, totp_enabled FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.totp_enabled || !user.totp_secret) return res.status(400).json({ error: '2FA 未启用' });
    const passOk = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passOk) return res.status(401).json({ error: '当前密码错误' });
    const ok = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: String(token), window: 1 });
    if (!ok) return res.status(400).json({ error: '验证码错误' });
    await db.run('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
});
