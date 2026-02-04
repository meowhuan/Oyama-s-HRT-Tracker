const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: '缺少授权头' });
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: '授权格式错误' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: '无效或过期的 token' });
  }
}

router.use(authMiddleware);

router.get('/records', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, data, created_at, updated_at FROM records WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const parsed = rows.map(r => ({ id: r.id, data: JSON.parse(r.data), created_at: r.created_at, updated_at: r.updated_at }));
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.post('/records', (req, res) => {
  try {
    const payload = req.body.data;
    if (!payload) return res.status(400).json({ error: '缺少 data 字段' });
    const json = JSON.stringify(payload);
    const info = db.prepare('INSERT INTO records (user_id, data) VALUES (?, ?)').run(req.user.id, json);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.put('/records/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = req.body.data;
    if (!payload) return res.status(400).json({ error: '缺少 data 字段' });

    const existing = db.prepare('SELECT user_id FROM records WHERE id = ?').get(id);
    if (!existing || existing.user_id !== req.user.id) return res.status(404).json({ error: '记录未找到' });

    const json = JSON.stringify(payload);
    db.prepare('UPDATE records SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(json, id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

router.delete('/records/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT user_id FROM records WHERE id = ?').get(id);
    if (!existing || existing.user_id !== req.user.id) return res.status(404).json({ error: '记录未找到' });
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});
// Delete all records for authenticated user
// Must be declared BEFORE the '/records/:id' route to avoid 'all' being treated as an id param.
router.delete('/records/all', (req, res) => {
  try {
    // Safety: ensure req.user.id is a valid positive integer
    const uid = Number(req.user && req.user.id);
    if (!uid || uid <= 0) return res.status(400).json({ error: 'invalid user id' });
    console.log(`Deleting all records for user_id=${uid}`);
    const info = db.prepare('DELETE FROM records WHERE user_id = ?').run(uid);
    res.json({ ok: true, deleted: info.changes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// Note: the '/records/:id' route is defined below.

module.exports = router;
