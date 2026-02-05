const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { loadSetupConfig } = require('./setup_config');
const path = require('path');
const fs = require('fs');

const addColumnSafe = async (sql) => {
  try { await db.exec(sql); } catch (e) { /* ignore if exists */ }
};

const initSchema = async () => {
  const usersSql = db.type === 'postgres' ? `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      verified INTEGER DEFAULT 0,
      verification_token TEXT,
      is_admin INTEGER DEFAULT 0,
      is_root INTEGER DEFAULT 0,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      login_fail_count INTEGER DEFAULT 0,
      last_failed_at INTEGER,
      login_lock_until INTEGER,
      is_deleted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )` : db.type === 'mysql' ? `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(191) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email VARCHAR(255),
      verified TINYINT DEFAULT 0,
      verification_token TEXT,
      is_admin TINYINT DEFAULT 0,
      is_root TINYINT DEFAULT 0,
      totp_secret TEXT,
      totp_enabled TINYINT DEFAULT 0,
      login_fail_count INT DEFAULT 0,
      last_failed_at BIGINT,
      login_lock_until BIGINT,
      is_deleted TINYINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )` : `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      verified INTEGER DEFAULT 0,
      verification_token TEXT,
      is_admin INTEGER DEFAULT 0,
      is_root INTEGER DEFAULT 0,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      login_fail_count INTEGER DEFAULT 0,
      last_failed_at INTEGER,
      login_lock_until INTEGER,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;

  const recordsSql = db.type === 'postgres' ? `
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )` : db.type === 'mysql' ? `
    CREATE TABLE IF NOT EXISTS records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      data LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_records_user_id (user_id)
    )` : `
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`;

  await db.exec(usersSql);
  await db.exec(recordsSql);

  await addColumnSafe("ALTER TABLE users ADD COLUMN email TEXT");
  await addColumnSafe("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0");
  await addColumnSafe("ALTER TABLE users ADD COLUMN verification_token TEXT");
  await addColumnSafe("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0");
  await addColumnSafe("ALTER TABLE users ADD COLUMN totp_secret TEXT");
  await addColumnSafe("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0");
  await addColumnSafe("ALTER TABLE users ADD COLUMN login_fail_count INTEGER DEFAULT 0");
  await addColumnSafe("ALTER TABLE users ADD COLUMN last_failed_at INTEGER");
  await addColumnSafe("ALTER TABLE users ADD COLUMN login_lock_until INTEGER");
  await addColumnSafe("ALTER TABLE users ADD COLUMN is_root INTEGER DEFAULT 0");
  await addColumnSafe("ALTER TABLE users ADD COLUMN is_deleted INTEGER DEFAULT 0");

  const setupCfg = loadSetupConfig();
  console.log('Database initialized at', setupCfg.dbType === 'sqlite'
    ? (setupCfg.dbPath || path.join(__dirname, '..', 'data.db'))
    : `${setupCfg.dbType}://${setupCfg.dbHost}:${setupCfg.dbPort || ''}/${setupCfg.dbName}`);
};

const ensureBootstrapAdmin = async () => {
  try {
    const adminExists = await db.get('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
    if (!adminExists) {
      const username = 'admin';
      const password = uuidv4().split('-')[0] + Math.floor(Math.random() * 9000 + 1000);
      const password_hash = bcrypt.hashSync(password, 10);
      const info = await db.run('INSERT INTO users (username, password_hash, email, verified, is_admin, is_root, created_at) VALUES (?, ?, ?, 1, 1, 1, CURRENT_TIMESTAMP)', [username, password_hash, null]);
      const id = info.lastInsertRowid;
      const token = jwt.sign({ id, username }, process.env.JWT_SECRET || 'change_me', { expiresIn: '365d' });
      const out = `BOOTSTRAP ADMIN\nusername: ${username}\njwt: ${token}\n`;
      try { fs.writeFileSync(path.join(__dirname, '..', 'backend_admin_bootstrap.txt'), out, 'utf8'); } catch (e) {}
      console.log('='.repeat(60));
      console.log('BOOTSTRAP ADMIN CREATED — credentials (without plain password) written to backend_admin_bootstrap.txt');
      console.log('Username:', username);
      console.log('JWT (short):', token.slice(0, 24) + '...');
      console.log('NOTE: Plain password is NOT written to disk for security. Use the JWT to login or reset password in Admin.');
      console.log('='.repeat(60));
    }
  } catch (e) {
    console.error('Bootstrap admin creation failed', e);
  }
};

const initDb = async () => {
  await initSchema();
  await ensureBootstrapAdmin();
};

if (require.main === module) {
  initDb().catch((e) => { console.error('init_db failed', e); process.exit(1); });
}

module.exports = initDb;
