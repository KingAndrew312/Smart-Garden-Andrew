const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Temporary Memory Storage (untuk Vercel Serverless)
let latestSensorData = {
    water_level_percent: 0,
    water_depth_cm: 0,
    volume_liters: 0,
    rssi: 0,
    timestamp: new Date().toISOString()
};

let currentPumpCommand = 'pump_off';

// 1. Endpoint POST dari ESP32 untuk kirim data & ambil perintah pompa
app.post('/api/sensor', (req, res) => {
    const { water_level_percent, water_depth_cm, volume_liters, rssi } = req.body;

    if (water_level_percent === undefined) {
        return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
    }

    latestSensorData = {
        water_level_percent,
        water_depth_cm,
        volume_liters,
        rssi,
        timestamp: new Date().toISOString()
    };

    res.json({
        status: 'success',
        message: 'Data berhasil disimpan',
        pump_command: currentPumpCommand
    });
});

// 2. Endpoint GET untuk Dashboard Web mengambil data terbaru
app.get('/api/sensor/latest', (req, res) => {
    res.json({
        status: 'success',
        record: latestSensorData
    });
});

// 3. Endpoint POST dari Web untuk kontrol pompa
app.post('/api/pump/command', (req, res) => {
    const { command } = req.body;
    if (!['pump_on', 'pump_off'].includes(command)) {
        return res.status(400).json({ status: 'error', message: 'Perintah tidak valid' });
    }

    currentPumpCommand = command;
    res.json({ status: 'success', message: `Perintah ${command} disimpan` });
});

// 4. Endpoint GET untuk ESP32 cek status pompa (opsional)
app.get('/api/pump/status', (req, res) => {
    res.json({ status: 'success', pump_command: currentPumpCommand });
});

// Untuk testing lokal
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server lokal berjalan di http://localhost:${PORT}`));
}

module.exports = app;
