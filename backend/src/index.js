require('dotenv').config();
// Ensure DB schema initialized/updated before routes use it
const initDb = require('./init_db');
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./auth');
const dataRoutes = require('./data');
const adminRoutes = require('./admin');
const setupRoutes = require('./setup');
const { loadSetupConfig } = require('./setup_config');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/admin', adminRoutes);
app.use('/setup', setupRoutes);

// Serve frontend static files if built; if not, expose a simple JSON root
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
	app.use(express.static(distPath));
	// For SPA routes, return index.html so client routing works
	app.get('*', (req, res) => {
		res.sendFile(path.join(distPath, 'index.html'));
	});
} else {
	app.get('/', (req, res) => res.json({ ok: true, message: 'HRT Tracker Backend' }));
}

const port = process.env.PORT || 4000;
(async () => {
	await initDb();
	app.listen(port, () => {
		const cfg = loadSetupConfig();
		if (!cfg.configured) {
			console.log('[setup] Setup not completed yet. Frontend should show the install wizard.');
		}
		console.log(`Server listening on http://localhost:${port}`);
	});
})().catch((e) => {
	console.error('Failed to initialize DB:', e);
	process.exit(1);
});
