const db = require('./src/db');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode-terminal');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--username' && args[i + 1]) out.username = args[i + 1];
    if (args[i] === '--rotate') out.rotate = true;
  }
  return out;
};

const main = async () => {
  const { username, rotate } = parseArgs();
  const user = username
    ? await db.get('SELECT id, username, totp_secret, totp_enabled, is_admin, is_root FROM users WHERE username = ?', [username])
    : await db.get('SELECT id, username, totp_secret, totp_enabled, is_admin, is_root FROM users WHERE is_root = 1 OR is_admin = 1 ORDER BY is_root DESC, id ASC LIMIT 1');

  if (!user) {
    console.error('No admin user found. Use --username to target a specific user.');
    process.exit(1);
  }
  if (!user.is_admin && !user.is_root) {
    console.error('Target user is not admin.');
    process.exit(1);
  }

  let secret = user.totp_secret;
  if (!secret || rotate) {
    const generated = speakeasy.generateSecret({ length: 20, name: `HRT Tracker (${user.username})` });
    secret = generated.base32;
    await db.run('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?', [secret, user.id]);
    if (rotate) {
      console.log('[2FA] Rotated secret and enabled 2FA for:', user.username);
      console.log('[2FA] NOTE: This invalidates previous 2FA tokens for this user.');
    } else {
      console.log('[2FA] Generated new secret and enabled 2FA for:', user.username);
    }
  } else {
    console.log('[2FA] Existing 2FA secret found; printing without changes.');
  }

  const label = `HRT Tracker (${user.username})`;
  const otpauth = speakeasy.otpauthURL({ secret, label, issuer: 'HRT Tracker', encoding: 'base32' });

  console.log('='.repeat(60));
  console.log('[2FA] user:', user.username);
  console.log('[2FA] secret:', secret);
  console.log('[2FA] otpauth:', otpauth);
  try {
    qrcode.generate(otpauth, { small: true });
  } catch (e) {
    console.error('[2FA] QR generate failed:', e);
  }
  console.log('='.repeat(60));
};

main().catch((e) => {
  console.error('print-2fa failed', e);
  process.exit(1);
});
