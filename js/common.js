// Dipakai bersama oleh index.html (dashboard) dan data.html (tabel data)

// Base URL API (kosong = domain yang sama dengan dashboard)
const API_BASE = '';
const BATAS_KERING = 35;

// Kolom yang tampil di tabel & di-download (data DHT temperature/humidity sengaja tidak dimasukkan)
const COLUMNS = [
    ['timestamp', 'Waktu'],
    ['device_id', 'Device'],
    ['tanaman', 'Tanaman'],
    ['soil_percent', 'Soil (%)'],
    ['soil_raw', 'Soil Raw'],
    ['is_soil_dry', 'Tanah Kering'],
    ['water_raw', 'Water Raw'],
    ['water_level_status', 'Status Air'],
    ['is_water_empty', 'Air Habis'],
    ['pump_status', 'Pompa']
];

// Field tambahan yang hanya dipakai dashboard (kartu pompa & tombol kontrol), tidak tampil di tabel
const EXTRA_FIELDS = ['relay_d23', 'pump_command', 'pump_command_local'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Ambil hanya field yang ditampilkan (membuang temperature & humidity)
function pick(data, timestamp) {
    const r = { id: data.id ?? null };
    for (const [key] of COLUMNS) r[key] = data[key] ?? null;
    for (const key of EXTRA_FIELDS) r[key] = data[key] ?? null;
    r.timestamp = timestamp || data.timestamp || new Date().toISOString();
    return r;
}

// Float switch: water_raw 1 = air ada, 0 = air habis
function isWaterEmpty(r) {
    if (r.water_raw === 0 || r.water_raw === 1) return r.water_raw === 0;
    return Boolean(r.is_water_empty);
}
const waterLabel = (raw) => (raw === 1 ? 'Ada' : raw === 0 ? 'Habis' : '-');

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
    el.innerText = body.database === 'mysql'
        ? `Database ${body.name}: ${total} data tersimpan`
        : `Database belum diset (memori): ${total} data`;
    el.className = `text-xs ${body.database === 'mysql' ? 'text-emerald-400' : 'text-amber-400'}`;
}
