require('dotenv').config();
// Ensure DB schema initialized/updated before routes use it
require('./init_db');
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./auth');
const dataRoutes = require('./data');
const adminRoutes = require('./admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/auth', authRoutes);
app.use('/api', dataRoutes);
app.use('/admin', adminRoutes);

app.get('/', (req, res) => res.json({ ok: true, message: 'HRT Tracker Backend' }));

// Serve frontend static files if built
const fs = require('fs');
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
	app.use(express.static(distPath));
	app.get('*', (req, res) => {
		res.sendFile(path.join(distPath, 'index.html'));
	});
}

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
