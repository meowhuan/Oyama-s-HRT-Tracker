const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  verified INTEGER DEFAULT 0,
  verification_token TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
)`).run();

// Add missing columns if DB was created with earlier schema
try {
  db.prepare("ALTER TABLE users ADD COLUMN email TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN verification_token TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN totp_secret TEXT").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  db.prepare("ALTER TABLE users ADD COLUMN is_root INTEGER DEFAULT 0").run();
} catch (e) {}

console.log('Database initialized at', require('path').join(__dirname, '..', 'data.db'));

// Create a bootstrap admin if none exists and emit credentials
try {
  const adminExists = db.prepare('SELECT id FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (!adminExists) {
    const username = 'admin';
    const password = uuidv4().split('-')[0] + Math.floor(Math.random()*9000+1000);
    const password_hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, password_hash, email, verified, is_admin, is_root, created_at) VALUES (?, ?, ?, 1, 1, 1, CURRENT_TIMESTAMP)').run(username, password_hash, null);
    const id = info.lastInsertRowid;
    const token = jwt.sign({ id, username }, process.env.JWT_SECRET || 'change_me', { expiresIn: '365d' });
    const out = `BOOTSTRAP ADMIN\nusername: ${username}\njwt: ${token}\n`;
    try { require('fs').writeFileSync(require('path').join(__dirname,'..','backend_admin_bootstrap.txt'), out, 'utf8'); } catch (e) {}
    console.log('='.repeat(60));
    console.log('BOOTSTRAP ADMIN CREATED — credentials (without plain password) written to backend_admin_bootstrap.txt');
    console.log('Username:', username);
    console.log('JWT (short):', token.slice(0,24) + '...');
    console.log('NOTE: Plain password is NOT written to disk for security. Use the JWT to login or reset password in Admin.');
    console.log('='.repeat(60));
  }
} catch (e) {
  console.error('Bootstrap admin creation failed', e);
}
