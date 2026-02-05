const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadSetupConfig, saveSetupConfig } = require('./setup_config');

const router = express.Router();

const ensureParentDir = (filePath) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error('Failed to ensure db directory:', e);
  }
};

router.get('/status', (req, res) => {
  const cfg = loadSetupConfig();
  res.json({
    configured: !!cfg.configured,
    dbType: cfg.dbType,
    dbPath: cfg.dbPath,
    dbHost: cfg.dbHost,
    dbPort: cfg.dbPort,
    dbUser: cfg.dbUser,
    dbName: cfg.dbName,
    updatedAt: cfg.updatedAt || null,
  });
});

router.post('/complete', (req, res) => {
  try {
    const { dbType, dbPath, dbHost, dbPort, dbUser, dbPassword, dbName } = req.body || {};
    const nextType = (dbType || 'sqlite').toLowerCase();
    if (!['sqlite', 'postgres', 'mysql'].includes(nextType)) {
      return res.status(400).json({ ok: false, error: '不支持的数据库类型' });
    }

    if (nextType === 'sqlite') {
      const nextDbPath = (dbPath && typeof dbPath === 'string' && dbPath.trim()) || path.join(__dirname, '..', 'data.db');
      ensureParentDir(nextDbPath);
      const next = saveSetupConfig({
        configured: true,
        dbType: 'sqlite',
        dbPath: nextDbPath,
      });
      console.log('[setup] Saved sqlite config:', { dbType: 'sqlite', dbPath: nextDbPath });
      return res.json({ ok: true, config: next });
    }

    if (!dbHost || !dbUser || !dbName) {
      return res.status(400).json({ ok: false, error: '请填写数据库主机、用户名和数据库名' });
    }

    const next = saveSetupConfig({
      configured: true,
      dbType: nextType,
      dbHost: String(dbHost),
      dbPort: dbPort ? Number(dbPort) : undefined,
      dbUser: String(dbUser),
      dbPassword: dbPassword ? String(dbPassword) : '',
      dbName: String(dbName),
    });
    console.log('[setup] Saved remote db config:', { dbType: nextType, dbHost, dbPort, dbUser, dbName });
    return res.json({ ok: true, config: next });
  } catch (e) {
    console.error('Setup complete failed:', e);
    return res.status(500).json({ ok: false, error: '保存安装向导设置失败' });
  }
});

router.post('/test', async (req, res) => {
  const { dbType, dbPath, dbHost, dbPort, dbUser, dbPassword, dbName } = req.body || {};
  const nextType = (dbType || 'sqlite').toLowerCase();
  try {
    if (!['sqlite', 'postgres', 'mysql'].includes(nextType)) {
      return res.status(400).json({ ok: false, error: '不支持的数据库类型' });
    }

    if (nextType === 'sqlite') {
      const nextDbPath = (dbPath && typeof dbPath === 'string' && dbPath.trim()) || path.join(__dirname, '..', 'data.db');
      ensureParentDir(nextDbPath);
      console.log('[setup][test] sqlite path=', nextDbPath);
      const Database = require('better-sqlite3');
      const testDb = new Database(nextDbPath);
      testDb.prepare('SELECT 1').get();
      testDb.close();
      return res.json({ ok: true });
    }

    if (!dbHost || !dbUser || !dbName) {
      return res.status(400).json({ ok: false, error: '请填写数据库主机、用户名和数据库名' });
    }

    if (nextType === 'postgres') {
      const { Pool } = require('pg');
      console.log('[setup][test] postgres host=', dbHost, 'port=', dbPort, 'user=', dbUser, 'db=', dbName);
      const pool = new Pool({
        host: dbHost,
        port: dbPort ? Number(dbPort) : 5432,
        user: dbUser,
        password: dbPassword || '',
        database: dbName,
      });
      await pool.query('SELECT 1');
      await pool.end();
      return res.json({ ok: true });
    }

    if (nextType === 'mysql') {
      const mysql = require('mysql2/promise');
      console.log('[setup][test] mysql host=', dbHost, 'port=', dbPort, 'user=', dbUser, 'db=', dbName);
      const conn = await mysql.createConnection({
        host: dbHost,
        port: dbPort ? Number(dbPort) : 3306,
        user: dbUser,
        password: dbPassword || '',
        database: dbName,
      });
      await conn.query('SELECT 1');
      await conn.end();
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error('[setup][test] failed:', e && e.message ? e.message : e);
    return res.status(500).json({ ok: false, error: '连接失败，请检查配置与网络' });
  }
});

module.exports = router;
