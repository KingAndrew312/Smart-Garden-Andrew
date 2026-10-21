// Subscribe data sensor ESP32 dari broker MQTT lalu simpan ke database "peter".
// Otomatis jalan bersama `npm start`, atau sendiri dengan `npm run listen`.
const mqtt = require('mqtt');
const { normalize } = require('./fields');
const store = require('./store');

const MQTT_URL = process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883';
const TOPIC = process.env.MQTT_TOPIC || 'binus/garden/sensor/data';

function startListener() {
    const clientId = 'smart-garden-listener-' + Math.random().toString(16).slice(2, 10);
    const client = mqtt.connect(MQTT_URL, { clientId, reconnectPeriod: 5000 });

    client.on('connect', () => {
        console.log(`[MQTT] Terhubung ke ${MQTT_URL}, subscribe ${TOPIC}`);
        client.subscribe(TOPIC);
    });
    client.on('reconnect', () => console.log('[MQTT] Menghubungkan ulang...'));
    client.on('error', (err) => console.error('[MQTT] Error:', err.message));

    client.on('message', async (topic, payload) => {
        let data;
        try {
            data = JSON.parse(payload.toString());
        } catch {
            console.warn('[MQTT] Payload bukan JSON, diabaikan');
            return;
        }

        const row = normalize(data);
        if (row.soil_percent === null) {
            console.warn('[MQTT] soil_percent tidak ada, diabaikan');
            return;
        }

        try {
            await store.addReading(row);
            console.log(`[DB] Tersimpan: soil ${row.soil_percent}% | air ${row.water_level_status} | pompa ${row.pump_status} (${row.pump_command})`);
        } catch (err) {
            console.error('[DB] Gagal menyimpan:', err.message);
        }
    });

    return client;
}

module.exports = { startListener };

if (require.main === module) startListener();
