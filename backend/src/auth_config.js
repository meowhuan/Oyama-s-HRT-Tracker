const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'auth_config.json');

const normalize = (cfg) => {
  const enableVerification = !!cfg.enableVerification;
  const enable2FA = !!cfg.enable2FA;
  const noVerification = !!cfg.noVerification;
  if (noVerification) {
    return { configured: !!cfg.configured, enableVerification: false, enable2FA: false, noVerification: true };
  }
  return { configured: !!cfg.configured, enableVerification, enable2FA, noVerification: false };
};

const loadAuthConfig = () => {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = raw ? JSON.parse(raw) : {};
      return normalize({ configured: true, ...parsed });
    }
  } catch (e) {
    console.error('Failed to read auth config:', e);
  }
  return { configured: false, enableVerification: false, enable2FA: false, noVerification: false };
};

const saveAuthConfig = (partial) => {
  const next = normalize({ ...partial, configured: true });
  try {
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write auth config:', e);
  }
  return next;
};

module.exports = {
  configPath,
  loadAuthConfig,
  saveAuthConfig,
};
