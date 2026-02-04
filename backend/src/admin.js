const express = require('express');
const db = require('./db');
const { loadConfig, saveConfig } = require('./email');

const router = express.Router();

function adminMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  const jwt = require('jsonwebtoken');
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET || 'change_me');
    const user = db.prepare('SELECT is_admin, is_root FROM users WHERE id = ?').get(payload.id);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'admin only' });
    req.admin = { id: payload.id, is_admin: !!user.is_admin, is_root: !!user.is_root };
    next();
  } catch (e) { return res.status(401).json({ error: 'invalid token' }); }
}

router.use(adminMiddleware);

router.get('/users', (req, res) => {
  // ensure soft-delete column exists (best-effort)
  try { db.prepare("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0").run(); } catch (e) { /* ignore if exists */ }
  const rows = db.prepare('SELECT id, username, email, verified, is_admin, created_at FROM users WHERE COALESCE(is_deleted,0)=0 ORDER BY created_at DESC').all();
  res.json(rows);
});

router.get('/email-config', (req, res) => {
  const cfg = loadConfig();
  res.json(cfg || {});
});

router.post('/email-config', (req, res) => {
  const cfg = req.body || {};
  saveConfig(cfg);
  res.json({ ok: true });
});

// The /claim route is intentionally disabled to avoid accidental self-promotion.
router.post('/claim', (req, res) => {
  return res.status(403).json({ error: 'admin claim disabled; use an existing admin to promote accounts' });
});

// Admin can reset another user's password (generate new random password and return it)
router.post('/reset-password', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const target = db.prepare('SELECT id, is_root FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'user not found' });
    // Only root admin may reset the root user's password
    if (target.is_root && !req.admin?.is_root) return res.status(403).json({ error: 'cannot reset root password' });
    const newPass = require('uuid').v4().split('-')[0] + Math.floor(Math.random()*9000+1000);
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(newPass, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    res.json({ ok: true, password: newPass });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can promote an existing user to admin
router.post('/promote-user', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // Any existing admin may promote other users to admin (but cannot modify root)
    if (!req.admin?.is_admin) return res.status(403).json({ error: 'admin only' });
    const target = db.prepare('SELECT id, is_admin, is_root FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (target.is_admin) return res.status(400).json({ error: 'user already admin' });
    if (target.is_root) return res.status(400).json({ error: 'cannot modify root' });
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can demote an admin user (root only)
router.post('/demote-user', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    if (!req.admin?.is_admin) return res.status(403).json({ error: 'admin only' });
    const target = db.prepare('SELECT id, is_admin, is_root FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (!target.is_admin) return res.status(400).json({ error: 'user is not admin' });
    if (target.is_root) return res.status(400).json({ error: 'cannot modify root' });
    // Prevent admins demoting themselves
    if (req.admin && req.admin.id === userId) return res.status(400).json({ error: 'cannot demote yourself' });
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can delete another user. Supports soft-delete (default), hard-delete, and export-before-delete.
router.post('/delete-user', (req, res) => {
  const { userId, hard, exportBefore } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // ensure soft-delete column exists
    try { db.prepare("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0").run(); } catch (e) { }
    const target = db.prepare('SELECT id, is_admin, username, email FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'user not found' });
    // prevent deleting root or admin users via this endpoint unless requester is root
    const tFull = db.prepare('SELECT is_admin, is_root FROM users WHERE id = ?').get(userId);
    if (tFull?.is_root) return res.status(403).json({ error: 'cannot delete root user' });
    if (tFull?.is_admin && !req.admin?.is_root) return res.status(403).json({ error: 'only root may delete admin users' });

    // Optionally export data before deletion
    if (exportBefore) {
      const rows = db.prepare('SELECT id, data, created_at, updated_at FROM records WHERE user_id = ? ORDER BY created_at DESC').all(userId);
      return res.json({ ok: true, exported: rows, user: { id: target.id, username: target.username, email: target.email } });
    }

    if (hard) {
      // hard delete: remove records and user row
      db.prepare('DELETE FROM records WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      return res.json({ ok: true, hardDeleted: true });
    }

    // default: soft delete
    db.prepare('UPDATE users SET is_deleted = 1 WHERE id = ?').run(userId);
    return res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// List soft-deleted users
router.get('/deleted-users', (req, res) => {
  try {
    try { db.prepare("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0").run(); } catch (e) { }
    const rows = db.prepare('SELECT id, username, email, created_at FROM users WHERE COALESCE(is_deleted,0)=1 ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Restore soft-deleted user
router.post('/restore-user', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    db.prepare('UPDATE users SET is_deleted = 0 WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can view another user's records
router.get('/user-records/:id', (req, res) => {
  const uid = Number(req.params.id);
  if (!uid) return res.status(400).json({ error: 'invalid id' });
  try {
    const rows = db.prepare('SELECT id, data, created_at, updated_at FROM records WHERE user_id = ? ORDER BY created_at DESC').all(uid);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

module.exports = router;
