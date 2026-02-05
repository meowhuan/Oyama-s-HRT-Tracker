const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadSetupConfig, saveSetupConfig } = require('./setup_config');
const { loadAuthConfig, saveAuthConfig } = require('./auth_config');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode-terminal');

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
  const auth = loadAuthConfig();
  res.json({
    configured: !!cfg.configured,
    dbType: cfg.dbType,
    dbPath: cfg.dbPath,
    dbHost: cfg.dbHost,
    dbPort: cfg.dbPort,
    dbUser: cfg.dbUser,
    dbName: cfg.dbName,
    updatedAt: cfg.updatedAt || null,
    dbPasswordSet: !!cfg.dbPassword,
    auth: {
      configured: !!auth.configured,
      enableVerification: !!auth.enableVerification,
      enable2FA: !!auth.enable2FA,
      noVerification: !!auth.noVerification,
    }
  });
});

router.post('/complete', (req, res) => {
  try {
    const { dbType, dbPath, dbHost, dbPort, dbUser, dbPassword, dbName, auth } = req.body || {};
    const proceed = () => {
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

    const current = loadSetupConfig();
    const nextPassword = (dbPassword !== undefined) ? String(dbPassword) : (current.dbPassword || '');
      const next = saveSetupConfig({
        configured: true,
        dbType: nextType,
        dbHost: String(dbHost),
        dbPort: dbPort ? Number(dbPort) : undefined,
        dbUser: String(dbUser),
        dbPassword: nextPassword,
        dbName: String(dbName),
      });
      console.log('[setup] Saved remote db config:', { dbType: nextType, dbHost, dbPort, dbUser, dbName });
      return res.json({ ok: true, config: next });
    };

    if (auth) {
      if (auth.enable2FA) {
        (async () => {
          try {
            const db = require('./db');
            const admin = await db.get('SELECT id, username FROM users WHERE is_root = 1 OR is_admin = 1 ORDER BY is_root DESC, id ASC LIMIT 1');
            if (!admin) return res.status(400).json({ ok: false, error: '未找到管理员账户，无法启用 2FA' });

            const secret = speakeasy.generateSecret({ length: 20, name: `HRT Tracker (${admin.username})` });
            await db.run('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?', [secret.base32, admin.id]);

            console.log('[setup] 2FA enabled for admin:', admin.username);
            console.log('[setup] 2FA secret:', secret.base32);
            console.log('[setup] 2FA otpauth:', secret.otpauth_url);
            try {
              qrcode.generate(secret.otpauth_url, { small: true });
            } catch (e) {
              console.error('[setup] QR generate failed:', e);
            }
          } catch (e) {
            console.error(e);
            return res.status(500).json({ ok: false, error: '初始化 2FA 失败' });
          }

          const nextAuth = {
            enableVerification: !!auth.enableVerification,
            enable2FA: !!auth.enable2FA,
            noVerification: !!auth.noVerification,
          };
          if (nextAuth.noVerification) {
            nextAuth.enableVerification = false;
            nextAuth.enable2FA = false;
          }
          saveAuthConfig(nextAuth);
          console.log('[setup] Saved auth config:', nextAuth);
          proceed();
        })();
        return;
      }
      const nextAuth = {
        enableVerification: !!auth.enableVerification,
        enable2FA: !!auth.enable2FA,
        noVerification: !!auth.noVerification,
      };
      if (nextAuth.noVerification) {
        nextAuth.enableVerification = false;
        nextAuth.enable2FA = false;
      }
      saveAuthConfig(nextAuth);
      console.log('[setup] Saved auth config:', nextAuth);
      return proceed();
    }

    return proceed();
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

    const stored = loadSetupConfig();
    const effectivePassword = (dbPassword !== undefined) ? dbPassword : (stored.dbPassword || '');

    if (nextType === 'postgres') {
      const { Pool } = require('pg');
      console.log('[setup][test] postgres host=', dbHost, 'port=', dbPort, 'user=', dbUser, 'db=', dbName);
      const pool = new Pool({
        host: dbHost,
        port: dbPort ? Number(dbPort) : 5432,
        user: dbUser,
        password: effectivePassword || '',
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
        password: effectivePassword || '',
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
