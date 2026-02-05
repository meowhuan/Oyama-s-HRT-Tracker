#!/usr/bin/env node
const db = require('./src/db');
const jwt = require('jsonwebtoken');

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

async function main() {
  const args = parseArgs();
  const username = args.username;
  const id = args.id ? Number(args.id) : null;
  const expires = args.expires || '365d';

  if (!username && !id) {
    console.error('Usage: node get_user_token.js --username <name> | --id <id> [--expires 30d]');
    process.exit(2);
  }

  try {
    let user;
    if (username) user = await db.get('SELECT id, username FROM users WHERE username = ?', [username]);
    else user = await db.get('SELECT id, username FROM users WHERE id = ?', [id]);

    if (!user) {
      console.error('User not found');
      process.exit(3);
    }

    const secret = process.env.JWT_SECRET || 'change_me';
    const token = jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: expires });
    console.log('USER:', user.username, 'ID:', user.id);
    console.log('TOKEN:');
    console.log(token);
    process.exit(0);
  } catch (e) {
    console.error('Failed to generate token:', e && e.message ? e.message : e);
    process.exit(4);
  }
}

main();
