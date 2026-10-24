const express = require('express');
const cors = require('cors');
const store = require('../lib/store');
const { normalize } = require('../lib/fields');

const app = express();

app.use(cors());
app.use(express.json());

const HISTORY_MAX = 1000;

// 1. Status database
app.get('/api/status', async (req, res) => {
    try {
        res.json({ status: 'success', database: store.type, name: store.name, total: await store.count() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', database: store.type, name: store.name, message: 'Database tidak terhubung' });
    }
});

// 2. Simpan data sensor lewat HTTP (opsional, untuk testing; jalur utama lewat MQTT listener)
app.post('/api/sensor', async (req, res) => {
    const row = normalize(req.body);
    if (row.soil_percent === null) {
        return res.status(400).json({ status: 'error', message: 'soil_percent wajib diisi' });
    }

    try {
        await store.addReading(row);
        res.json({ status: 'success', message: 'Data berhasil disimpan' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan data' });
    }
});

// 3. Data sensor terbaru
app.get('/api/sensor/latest', async (req, res) => {
    try {
        const [record] = await store.getHistory(1);
        res.json({ status: 'success', record: record || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data' });
    }
});

// Filter dari query string: ?q=&from=&to=&soil=dry|wet&water=empty|ok&pump=ON|OFF&light=dark|bright
// from/to berupa tanggal ISO; data diambil dari from (termasuk) sampai sebelum to
function parseFilters(query) {
    const toDate = (v) => {
        const d = new Date(v);
        return v && !isNaN(d) ? d : null;
    };
    const oneOf = (v, options) => (options.includes(v) ? v : '');
    return {
        q: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
        from: toDate(query.from),
        to: toDate(query.to),
        soil: oneOf(query.soil, ['dry', 'wet']),
        water: oneOf(query.water, ['empty', 'ok']),
        pump: oneOf(query.pump, ['ON', 'OFF']),
        light: oneOf(query.light, ['dark', 'bright'])
    };
}

// 4. Riwayat data dengan filter & pagination (?page=1&per_page=10, terbaru dulu)
app.get('/api/sensor/history', async (req, res) => {
    const perPage = Math.min(Math.max(parseInt(req.query.per_page ?? req.query.limit, 10) || 50, 1), HISTORY_MAX);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    try {
        const [{ records, total }, totalAll] = await Promise.all([
            store.search(parseFilters(req.query), page, perPage),
            store.count()
        ]);
        res.json({
            status: 'success',
            database: store.type,
            name: store.name,
            total_all: totalAll,
            total,
            page,
            per_page: perPage,
            pages: Math.max(Math.ceil(total / perPage), 1),
            records
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data' });
    }
});

// 5. Semua data (sesuai filter yang sama dengan history) untuk download, terlama dulu
app.get('/api/sensor/export', async (req, res) => {
    try {
        res.json({ status: 'success', records: await store.getAll(parseFilters(req.query)) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data' });
    }
});

// Untuk server lokal / Docker (di Vercel tidak dijalankan)
if (!process.env.VERCEL) {
    const path = require('path');
    const { startListener } = require('../lib/mqtt-listener');

    const root = path.join(__dirname, '..');
    app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(root, 'index.html')));
    for (const file of ['data.html', 'favicon.svg', 'robots.txt', 'sitemap.xml']) {
        app.get(`/${file}`, (req, res) => res.sendFile(path.join(root, file)));
    }
    app.use('/js', express.static(path.join(root, 'js')));

    // Alamat MQTT WebSocket untuk dashboard. Di Docker diisi "/mqtt" (broker di server yang sama lewat Nginx).
    app.get('/config.js', (req, res) => {
        res.type('application/javascript').send(`window.APP_CONFIG = ${JSON.stringify({ mqttWsUrl: process.env.MQTT_WS_URL || '' })};`);
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT} (database: ${store.type})`);
        if (process.env.MQTT_LISTENER !== 'false') startListener();
    });
}

module.exports = app;
