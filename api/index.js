const express = require('express');
const cors = require('cors');
const { Redis } = require('@upstash/redis');

const app = express();

app.use(cors());
app.use(express.json());

// Jumlah maksimum data riwayat yang disimpan
const HISTORY_MAX = 1000;
const KEY_HISTORY = 'sensor:history';
const KEY_PUMP = 'pump:command';

// ===== Storage =====
// Di Vercel: pakai Upstash Redis (Storage > Marketplace > Upstash Redis).
// Env var yang didukung: KV_REST_API_URL/KV_REST_API_TOKEN atau UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN.
// Tanpa env var (testing lokal): fallback ke memori.
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

const memory = { history: [], pump: 'pump_off' };

const store = {
    // Simpan data sensor baru, kembalikan perintah pompa saat ini
    async addReading(record) {
        if (!redis) {
            memory.history.unshift(record);
            memory.history.length = Math.min(memory.history.length, HISTORY_MAX);
            return memory.pump;
        }
        const [, , pump] = await redis.pipeline()
            .lpush(KEY_HISTORY, record)
            .ltrim(KEY_HISTORY, 0, HISTORY_MAX - 1)
            .get(KEY_PUMP)
            .exec();
        return pump || 'pump_off';
    },
    // Ambil data terbaru (urutan: terbaru dulu)
    async getHistory(limit) {
        if (!redis) return memory.history.slice(0, limit);
        return redis.lrange(KEY_HISTORY, 0, limit - 1);
    },
    async getPump() {
        if (!redis) return memory.pump;
        return (await redis.get(KEY_PUMP)) || 'pump_off';
    },
    async setPump(command) {
        if (!redis) memory.pump = command;
        else await redis.set(KEY_PUMP, command);
    }
};

const toNumber = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

// 1. Endpoint POST dari ESP32 untuk kirim data & ambil perintah pompa
app.post('/api/sensor', async (req, res) => {
    const { water_level_percent, water_depth_cm, volume_liters, rssi } = req.body || {};

    if (water_level_percent === undefined || isNaN(Number(water_level_percent))) {
        return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
    }

    const record = {
        water_level_percent: toNumber(water_level_percent),
        water_depth_cm: toNumber(water_depth_cm),
        volume_liters: toNumber(volume_liters),
        rssi: toNumber(rssi),
        timestamp: new Date().toISOString()
    };

    try {
        const pump_command = await store.addReading(record);
        res.json({ status: 'success', message: 'Data berhasil disimpan', pump_command });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan data' });
    }
});

// 2. Endpoint GET untuk Dashboard Web mengambil data terbaru
app.get('/api/sensor/latest', async (req, res) => {
    try {
        const [record] = await store.getHistory(1);
        res.json({ status: 'success', record: record || null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data' });
    }
});

// 3. Endpoint GET riwayat data untuk grafik (?limit=30, maks HISTORY_MAX)
app.get('/api/sensor/history', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), HISTORY_MAX);
    try {
        const records = await store.getHistory(limit);
        res.json({ status: 'success', records });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca data' });
    }
});

// 4. Endpoint POST dari Web untuk kontrol pompa
app.post('/api/pump/command', async (req, res) => {
    const { command } = req.body || {};
    if (!['pump_on', 'pump_off'].includes(command)) {
        return res.status(400).json({ status: 'error', message: 'Perintah tidak valid' });
    }

    try {
        await store.setPump(command);
        res.json({ status: 'success', message: `Perintah ${command} disimpan` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal menyimpan perintah' });
    }
});

// 5. Endpoint GET untuk ESP32 / Web cek status pompa
app.get('/api/pump/status', async (req, res) => {
    try {
        res.json({ status: 'success', pump_command: await store.getPump() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Gagal membaca status' });
    }
});

// Untuk testing lokal (di Vercel tidak dijalankan)
if (!process.env.VERCEL) {
    const path = require('path');
    app.use(express.static(path.join(__dirname, '..')));
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server lokal berjalan di http://localhost:${PORT}`);
        if (!redis) console.log('Redis belum dikonfigurasi, data disimpan di memori.');
    });
}

module.exports = app;
