// Dipakai bersama oleh index.html (dashboard) dan data.html (tabel data)

// Base URL API (kosong = domain yang sama dengan dashboard)
const API_BASE = '';
const BATAS_KERING = 35;

// Alamat MQTT WebSocket. Di server VPS (Docker) diisi "/mqtt" lewat /config.js,
// artinya broker Mosquitto di IP/domain yang sama dengan dashboard. Tanpa config: HiveMQ publik.
function mqttWsUrl() {
    const url = window.APP_CONFIG?.mqttWsUrl;
    if (!url) return 'wss://broker.hivemq.com:8884/mqtt';
    if (url.startsWith('/')) return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${url}`;
    return url;
}

// Kolom yang tampil di tabel & di-download.
// Data DHT11 (temperature, humidity) dan DS18B20 suhu air (soil_temperature) sengaja tidak dimasukkan.
const COLUMNS = [
    ['timestamp', 'Waktu'],
    ['soil_percent', 'Soil (%)'],
    ['soil_raw', 'Soil Raw'],
    ['is_soil_dry', 'Tanah'],
    ['water_raw', 'Water Raw'],
    ['water_level_status', 'Status Air'],
    ['is_water_empty', 'Air Habis'],
    ['pump_status', 'Pompa'],
    ['light_percent', 'Cahaya (%)'],
    ['light_raw', 'LDR Raw'],
    ['is_dark', 'Kondisi Cahaya'],
    ['led_d2', 'LED D2']
];

// Field tambahan yang hanya dipakai dashboard (tombol kontrol pompa), tidak tampil di tabel
const EXTRA_FIELDS = ['pump_command'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ambil hanya field yang ditampilkan (membuang data DHT & suhu air)
function pick(data, timestamp) {
    const r = {};
    for (const [key] of COLUMNS) r[key] = data[key] ?? null;
    for (const key of EXTRA_FIELDS) r[key] = data[key] ?? null;
    r.timestamp = timestamp || data.timestamp || new Date().toISOString();

    // Payload MQTT langsung dari ESP32 tidak membawa water_raw & is_soil_dry
    if (r.water_raw === null && r.is_water_empty !== null) r.water_raw = r.is_water_empty ? 0 : 1;
    if (r.is_soil_dry === null && r.soil_percent !== null) r.is_soil_dry = r.soil_percent < BATAS_KERING;
    return r;
}

// Float switch: water_raw 1 = air ada, 0 = air habis
function isWaterEmpty(r) {
    if (r.water_raw === 0 || r.water_raw === 1) return r.water_raw === 0;
    return Boolean(r.is_water_empty);
}

function badge(text, color) {
    return `<span class="px-2 py-0.5 rounded-full text-xs bg-${color}-500/20 text-${color}-400">${escapeHtml(text)}</span>`;
}

function cell(key, value) {
    if (value === null || value === undefined) return '<span class="text-slate-600">-</span>';
    switch (key) {
        case 'timestamp': return `<span class="font-mono text-xs text-slate-300 whitespace-nowrap">${fmtTime(value)}</span>`;
        case 'soil_percent': return `<span class="font-semibold text-emerald-400">${escapeHtml(value)}</span>`;
        case 'is_soil_dry': return value ? badge('Kering', 'amber') : badge('Lembab', 'emerald');
        case 'water_raw': return value === 0 ? badge('0 · Habis', 'rose') : value === 1 ? badge('1 · Ada', 'cyan') : escapeHtml(value);
        case 'is_water_empty': return value ? badge('Habis', 'rose') : badge('Ada', 'cyan');
        case 'water_level_status': return value === 'EMPTY' ? badge(value, 'rose') : badge(value, 'cyan');
        case 'pump_status': return value === 'ON' ? badge('ON', 'cyan') : badge('OFF', 'slate');
        case 'light_percent': return `<span class="font-semibold text-yellow-400">${escapeHtml(value)}</span>`;
        case 'is_dark': return value ? badge('Gelap', 'indigo') : badge('Terang', 'yellow');
        case 'led_d2': return value === 'ON' ? badge('ON', 'yellow') : badge('OFF', 'slate');
        default: return escapeHtml(value);
    }
}

// body = response /api/sensor/history atau /api/status; null = database tidak terhubung
function setDbStatus(body) {
    const el = $('db-status');
    if (!body) {
        el.innerText = 'Database tidak terhubung';
        el.className = 'text-xs text-rose-400';
        return;
    }
    const total = body.total_all ?? body.total;
    const online = body.database !== 'memory';
    el.innerText = online
        ? `InfluxDB (${body.name}): ${total} data tersimpan`
        : `Database belum diset (memori): ${total} data`;
    el.className = `text-xs ${online ? 'text-emerald-400' : 'text-amber-400'}`;
}
