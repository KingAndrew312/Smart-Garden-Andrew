// Field data sensor dari ESP32 (topik MQTT binus/garden/sensor/data) beserta tipenya di InfluxDB.
const FIELD_TYPES = {
    soil_percent: 'int',
    soil_raw: 'int',
    soil_temperature: 'float',  // DS18B20 (suhu air)
    temperature: 'float',       // DHT11
    humidity: 'float',          // DHT11
    water_raw: 'int',           // float switch: 1 = air ada, 0 = air habis
    water_level_status: 'string',
    is_water_empty: 'bool',
    is_soil_dry: 'bool',
    pump_status: 'string',
    pump_command: 'string',
    light_raw: 'int',
    light_percent: 'int',
    is_dark: 'bool',
    led_d2: 'string'
};

// Tetap disimpan di database, tetapi tidak ditampilkan / di-download
const HIDDEN_FIELDS = ['temperature', 'humidity', 'soil_temperature'];

const PUBLIC_FIELDS = ['timestamp', ...Object.keys(FIELD_TYPES).filter((f) => !HIDDEN_FIELDS.includes(f))];

// Kolom yang dicari oleh kotak pencarian
const SEARCH_FIELDS = ['soil_percent', 'soil_raw', 'water_level_status', 'pump_status', 'light_percent', 'light_raw', 'led_d2'];

const BATAS_KERING = 35;

const isMissing = (v) => v === undefined || v === null || v === '';
const CONVERT = {
    int: (v) => (isMissing(v) || isNaN(Number(v)) ? null : Math.round(Number(v))),
    float: (v) => (isMissing(v) || isNaN(Number(v)) ? null : Number(v)),
    bool: (v) => (isMissing(v) ? null : v === true || v === 1 || v === '1' || v === 'true'),
    string: (v) => (isMissing(v) ? null : String(v).slice(0, 20))
};

// Payload JSON dari ESP32 -> data yang disimpan
function normalize(data = {}) {
    const row = { device: isMissing(data.device_id) ? 'esp32' : String(data.device_id).slice(0, 50), time: new Date() };
    for (const [field, type] of Object.entries(FIELD_TYPES)) row[field] = CONVERT[type](data[field]);

    // Firmware baru tidak mengirim water_raw & is_soil_dry, jadi dihitung di sini
    if (row.water_raw === null && row.is_water_empty !== null) row.water_raw = row.is_water_empty ? 0 : 1;
    if (row.is_water_empty === null && row.water_raw !== null) row.is_water_empty = row.water_raw === 0;
    if (row.is_soil_dry === null && row.soil_percent !== null) row.is_soil_dry = row.soil_percent < BATAS_KERING;
    return row;
}

// Data tersimpan -> data untuk dashboard / download (tanpa field tersembunyi)
function toPublic(row) {
    const record = {};
    for (const field of PUBLIC_FIELDS) {
        record[field] = field === 'timestamp' ? new Date(row.time ?? row._time).toISOString() : row[field] ?? null;
    }
    return record;
}

module.exports = { FIELD_TYPES, PUBLIC_FIELDS, SEARCH_FIELDS, normalize, toPublic };
