const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'setup.json');
const defaultConfig = {
  configured: false,
  dbType: 'sqlite',
  dbPath: path.join(__dirname, '..', 'data.db'),
  dbHost: '127.0.0.1',
  dbPort: null,
  dbUser: '',
  dbPassword: '',
  dbName: 'hrt_tracker',
  updatedAt: null,
};

const loadSetupConfig = () => {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...defaultConfig, ...parsed };
    }
  } catch (e) {
    console.error('Failed to read setup config:', e);
  }
  return { ...defaultConfig };
};

const saveSetupConfig = (partial) => {
  const next = {
    ...loadSetupConfig(),
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write setup config:', e);
  }
  return next;
};

module.exports = {
  configPath,
  loadSetupConfig,
  saveSetupConfig,
};
