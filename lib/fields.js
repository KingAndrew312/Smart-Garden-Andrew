// Field data sensor dari ESP32 (topik MQTT binus/garden/sensor/data).
// temperature & humidity (DHT11) tetap disimpan di database, tetapi tidak ditampilkan / di-download.
const PUBLIC_FIELDS = [
    'id',
    'timestamp',
    'device_id',
    'tanaman',
    'soil_percent',
    'soil_raw',
    'is_soil_dry',
    'water_raw',
    'water_level_status',
    'is_water_empty',
    'pump_status',
    'relay_d23',
    'pump_command',
    'pump_command_local'
];

const BOOL_FIELDS = ['is_soil_dry', 'is_water_empty', 'relay_d23'];

const isEmpty = (v) => v === undefined || v === null || v === '' || isNaN(Number(v));
const toInt = (v) => (isEmpty(v) ? null : Math.round(Number(v)));
const toFloat = (v) => (isEmpty(v) ? null : Number(v));
const toBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const toStr = (v, max) => (v === undefined || v === null ? null : String(v).slice(0, max));

// Ubah payload JSON dari ESP32 menjadi baris database
function normalize(data = {}) {
    return {
        device_id: toStr(data.device_id, 50),
        tanaman: toStr(data.tanaman, 50),
        soil_percent: toInt(data.soil_percent),
        soil_raw: toInt(data.soil_raw),
        temperature: toFloat(data.temperature),
        humidity: toFloat(data.humidity),
        water_raw: toInt(data.water_raw),
        water_level_status: toStr(data.water_level_status, 10),
        is_water_empty: toBool(data.is_water_empty),
        is_soil_dry: toBool(data.is_soil_dry),
        pump_status: toStr(data.pump_status, 5),
        relay_d23: toBool(data.relay_d23),
        pump_command: toStr(data.pump_command, 10),
        pump_command_local: toStr(data.pump_command_local, 10),
        created_at: new Date()
    };
}

// Baris database -> data untuk dashboard / download (tanpa data DHT)
function toPublic(row) {
    const record = {};
    for (const field of PUBLIC_FIELDS) {
        if (field === 'timestamp') record.timestamp = new Date(row.created_at).toISOString();
        else if (BOOL_FIELDS.includes(field)) record[field] = Boolean(row[field]);
        else record[field] = row[field] ?? null;
    }
    return record;
}

module.exports = { PUBLIC_FIELDS, normalize, toPublic };
