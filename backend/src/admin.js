const express = require('express');
const db = require('./db');
const { loadConfig, saveConfig } = require('./email');
const { loadAuthConfig, saveAuthConfig } = require('./auth_config');

const router = express.Router();

async function adminMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'no auth' });
  const parts = header.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'bad auth' });
  const jwt = require('jsonwebtoken');
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET || 'change_me');
    const user = await db.get('SELECT is_admin, is_root FROM users WHERE id = ?', [payload.id]);
    if (!user || !user.is_admin) return res.status(403).json({ error: 'admin only' });
    req.admin = { id: payload.id, is_admin: !!user.is_admin, is_root: !!user.is_root };
    next();
  } catch (e) { return res.status(401).json({ error: 'invalid token' }); }
}

router.use(adminMiddleware);

router.get('/users', async (req, res) => {
  // ensure soft-delete column exists (best-effort)
  try { await db.exec("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0"); } catch (e) { /* ignore if exists */ }
  const rows = await db.all('SELECT id, username, email, verified, is_admin, created_at FROM users WHERE COALESCE(is_deleted,0)=0 ORDER BY created_at DESC');
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

router.get('/auth-config', (req, res) => {
  const cfg = loadAuthConfig();
  res.json(cfg || {});
});

router.post('/auth-config', (req, res) => {
  const cfg = req.body || {};
  (async () => {
    try {
      if (cfg.enable2FA) {
        const me = await db.get('SELECT totp_enabled FROM users WHERE id = ?', [req.admin?.id]);
        if (!me || !me.totp_enabled) {
          return res.status(400).json({ error: '启用 2FA 前请先在账户页绑定 2FA' });
        }
      }
      const next = saveAuthConfig(cfg);
      res.json({ ok: true, config: next });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server error' });
    }
  })();
});

// The /claim route is intentionally disabled to avoid accidental self-promotion.
router.post('/claim', (req, res) => {
  return res.status(403).json({ error: 'admin claim disabled; use an existing admin to promote accounts' });
});

// Admin can reset another user's password (generate new random password and return it)
router.post('/reset-password', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const target = await db.get('SELECT id, is_root FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'user not found' });
    // Only root admin may reset the root user's password
    if (target.is_root && !req.admin?.is_root) return res.status(403).json({ error: 'cannot reset root password' });
    const newPass = require('uuid').v4().split('-')[0] + Math.floor(Math.random()*9000+1000);
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(newPass, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    res.json({ ok: true, password: newPass });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can promote an existing user to admin
router.post('/promote-user', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // Any existing admin may promote other users to admin (but cannot modify root)
    if (!req.admin?.is_admin) return res.status(403).json({ error: 'admin only' });
    const target = await db.get('SELECT id, is_admin, is_root FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (target.is_admin) return res.status(400).json({ error: 'user already admin' });
    if (target.is_root) return res.status(400).json({ error: 'cannot modify root' });
    await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [userId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can demote an admin user (root only)
router.post('/demote-user', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    if (!req.admin?.is_admin) return res.status(403).json({ error: 'admin only' });
    const target = await db.get('SELECT id, is_admin, is_root FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (!target.is_admin) return res.status(400).json({ error: 'user is not admin' });
    if (target.is_root) return res.status(400).json({ error: 'cannot modify root' });
    // Prevent admins demoting themselves
    if (req.admin && req.admin.id === userId) return res.status(400).json({ error: 'cannot demote yourself' });
    await db.run('UPDATE users SET is_admin = 0 WHERE id = ?', [userId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can delete another user. Supports soft-delete (default), hard-delete, and export-before-delete.
router.post('/delete-user', async (req, res) => {
  const { userId, hard, exportBefore } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // ensure soft-delete column exists
    try { await db.exec("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0"); } catch (e) { }
    const target = await db.get('SELECT id, is_admin, username, email FROM users WHERE id = ?', [userId]);
    if (!target) return res.status(404).json({ error: 'user not found' });
    // prevent deleting root or admin users via this endpoint unless requester is root
    const tFull = await db.get('SELECT is_admin, is_root FROM users WHERE id = ?', [userId]);
    if (tFull?.is_root) return res.status(403).json({ error: 'cannot delete root user' });
    if (tFull?.is_admin && !req.admin?.is_root) return res.status(403).json({ error: 'only root may delete admin users' });

    // Optionally export data before deletion
    if (exportBefore) {
      const rows = await db.all('SELECT id, data, created_at, updated_at FROM records WHERE user_id = ? ORDER BY created_at DESC', [userId]);
      return res.json({ ok: true, exported: rows, user: { id: target.id, username: target.username, email: target.email } });
    }

    if (hard) {
      // hard delete: remove records and user row
      await db.run('DELETE FROM records WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
      return res.json({ ok: true, hardDeleted: true });
    }

    // default: soft delete
    await db.run('UPDATE users SET is_deleted = 1 WHERE id = ?', [userId]);
    return res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// List soft-deleted users
router.get('/deleted-users', async (req, res) => {
  try {
    try { await db.exec("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0"); } catch (e) { }
    const rows = await db.all('SELECT id, username, email, created_at FROM users WHERE COALESCE(is_deleted,0)=1 ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Restore soft-deleted user
router.post('/restore-user', async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await db.run('UPDATE users SET is_deleted = 0 WHERE id = ?', [userId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

// Admin can view another user's records
router.get('/user-records/:id', async (req, res) => {
  const uid = Number(req.params.id);
  if (!uid) return res.status(400).json({ error: 'invalid id' });
  try {
    const rows = await db.all('SELECT id, data, created_at, updated_at FROM records WHERE user_id = ? ORDER BY created_at DESC', [uid]);
    const parsed = rows.map(r => {
      let data = r.data;
      try { data = JSON.parse(r.data); } catch (e) {}
      return { ...r, data };
    });
    res.json(parsed);
  } catch (e) { console.error(e); res.status(500).json({ error: 'server error' }); }
});

module.exports = router;
