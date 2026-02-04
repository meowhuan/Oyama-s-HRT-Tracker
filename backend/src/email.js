const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const configPath = path.join(__dirname, '..', 'email_config.json');

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg || {}, null, 2), 'utf8');
}

async function sendMail(to, subject, text, html) {
  const cfg = loadConfig();
  if (!cfg || !cfg.host) throw new Error('SMTP not configured');
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: !!cfg.secure,
    auth: cfg.auth || undefined
  });
  const from = cfg.from || cfg.auth?.user;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendVerificationEmail(to, token, baseUrl) {
  const link = `${baseUrl.replace(/\/$/, '')}/auth/verify?token=${encodeURIComponent(token)}`;
  const subject = 'Verify your account';
  const text = `Please verify your account by visiting: ${link}`;
  const html = `<p>Please verify your account by clicking <a href="${link}">this link</a></p>`;
  return sendMail(to, subject, text, html);
}

module.exports = { loadConfig, saveConfig, sendMail, sendVerificationEmail };
