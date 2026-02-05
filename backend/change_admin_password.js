#!/usr/bin/env node
const db = require('./src/db');
const bcrypt = require('bcryptjs');
const readline = require('readline');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = process.argv[i+1] && !process.argv[i+1].startsWith('--') ? process.argv[++i] : true;
      args[k] = v;
    }
  }
  return args;
}

async function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs();
  const username = args.username || 'admin';
  let password = args.password;

  if (!password) {
    console.log(`No password provided on CLI. You will be prompted (input will be visible).`);
    password = await promptHidden(`Enter new password for ${username}: `);
  }

  if (!password || password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(2);
  }

  try {
    const user = await db.get('SELECT id, username FROM users WHERE username = ?', [username]);
    if (!user) {
      console.error('User not found:', username);
      process.exit(3);
    }
    const hash = bcrypt.hashSync(password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
    console.log(`Password updated for user: ${username}`);
    process.exit(0);
  } catch (e) {
    console.error('Failed to update password:', e && e.message ? e.message : e);
    process.exit(4);
  }
}

main();
