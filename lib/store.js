const { InfluxDB, Point, fluxString, fluxDateTime } = require('@influxdata/influxdb-client');
const { FIELD_TYPES, SEARCH_FIELDS, toPublic } = require('./fields');

// Baca .env (lokal) bila ada; di Docker env var diisi lewat docker-compose
try { process.loadEnvFile(); } catch { /* tidak ada .env */ }

// ===== Database InfluxDB =====
// Isi INFLUX_URL, INFLUX_TOKEN, INFLUX_ORG, INFLUX_BUCKET.
// Tanpa INFLUX_URL: fallback ke memori (data hilang saat server restart, hanya untuk testing).
const INFLUX_URL = process.env.INFLUX_URL;
const ORG = process.env.INFLUX_ORG || 'smart-garden';
const BUCKET = process.env.INFLUX_BUCKET || 'garden';
const MEASUREMENT = 'sensor_data';
const useInflux = Boolean(INFLUX_URL);
const MEMORY_MAX = 5000;

const influx = useInflux ? new InfluxDB({ url: INFLUX_URL, token: process.env.INFLUX_TOKEN }) : null;
const writeApi = influx ? influx.getWriteApi(ORG, BUCKET, 'ms') : null;
const queryApi = influx ? influx.getQueryApi(ORG) : null;
const memory = [];

// filters: { q, from, to (Date), soil: 'dry'|'wet', water: 'empty'|'ok', pump: 'ON'|'OFF', light: 'dark'|'bright' }
function fluxQuery(f = {}) {
    const start = f.from ? fluxDateTime(f.from.toISOString()) : '0';
    const stop = f.to ? fluxDateTime(f.to.toISOString()) : 'now()';
    const conds = [];
    if (f.soil) conds.push(`r.is_soil_dry == ${f.soil === 'dry'}`);
    // float switch: water_raw 1 = air ada, 0 = air habis
    if (f.water) conds.push(`r.water_raw == ${f.water === 'empty' ? 0 : 1}`);
    if (f.pump) conds.push(`r.pump_status == ${fluxString(f.pump)}`);
    if (f.light) conds.push(`r.is_dark == ${f.light === 'dark'}`);
    if (f.q) {
        const q = fluxString(f.q.toLowerCase());
        conds.push(`(${SEARCH_FIELDS.map((c) =>
            `(exists r.${c} and strings.containsStr(v: strings.toLower(v: string(v: r.${c})), substr: ${q}))`).join(' or ')})`);
    }
    return `import "strings"
from(bucket: ${fluxString(BUCKET)})
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> drop(columns: ["_start", "_stop", "_measurement"])
  |> group()
  ${conds.length ? `|> filter(fn: (r) => ${conds.join(' and ')})` : ''}`;
}

// InfluxDB menolak range dengan start >= stop (mis. "dari tanggal" di masa depan)
function emptyRange(f = {}) {
    const stop = f.to || new Date();
    return Boolean(f.from && f.from >= stop);
}

async function influxCount(filters) {
    if (emptyRange(filters)) return 0;
    // count() tidak bisa memakai kolom waktu; tag "device" selalu ada di setiap baris
    const rows = await queryApi.collectRows(`${fluxQuery(filters)}\n  |> count(column: "device")`);
    return rows.length ? Number(rows[0].device) : 0;
}

// Versi fluxQuery untuk penyimpanan memori
function matches(row, f = {}) {
    if (f.from && row.time < f.from) return false;
    if (f.to && row.time >= f.to) return false;
    if (f.soil && row.is_soil_dry !== (f.soil === 'dry')) return false;
    if (f.water && row.water_raw !== (f.water === 'empty' ? 0 : 1)) return false;
    if (f.pump && row.pump_status !== f.pump) return false;
    if (f.light && row.is_dark !== (f.light === 'dark')) return false;
    if (f.q) {
        const q = f.q.toLowerCase();
        return SEARCH_FIELDS.some((c) => row[c] !== null && String(row[c]).toLowerCase().includes(q));
    }
    return true;
}

const store = {
    type: useInflux ? 'influxdb' : 'memory',
    name: BUCKET,

    // Simpan satu data sensor (hasil fields.normalize)
    async addReading(row) {
        if (!useInflux) {
            memory.unshift(row);
            memory.length = Math.min(memory.length, MEMORY_MAX);
            return;
        }
        const point = new Point(MEASUREMENT).tag('device', row.device).timestamp(row.time);
        for (const [field, type] of Object.entries(FIELD_TYPES)) {
            const value = row[field];
            if (value === null || value === undefined) continue;
            if (type === 'int') point.intField(field, value);
            else if (type === 'float') point.floatField(field, value);
            else if (type === 'bool') point.booleanField(field, value);
            else point.stringField(field, value);
        }
        writeApi.writePoint(point);
        await writeApi.flush();
    },

    // Data untuk tabel: filter + pencarian + pagination (urutan: terbaru dulu)
    async search(filters, page, perPage) {
        const offset = (page - 1) * perPage;
        if (!useInflux) {
            const rows = memory.filter((row) => matches(row, filters));
            return { total: rows.length, records: rows.slice(offset, offset + perPage).map(toPublic) };
        }
        if (emptyRange(filters)) return { total: 0, records: [] };
        const [total, rows] = await Promise.all([
            influxCount(filters),
            queryApi.collectRows(`${fluxQuery(filters)}
  |> sort(columns: ["_time"], desc: true)
  |> limit(n: ${perPage}, offset: ${offset})`)
        ]);
        return { total, records: rows.map(toPublic) };
    },

    // Semua data (sesuai filter) untuk download (urutan: terlama dulu)
    async getAll(filters) {
        if (!useInflux) return memory.filter((row) => matches(row, filters)).reverse().map(toPublic);
        if (emptyRange(filters)) return [];
        const rows = await queryApi.collectRows(`${fluxQuery(filters)}\n  |> sort(columns: ["_time"])`);
        return rows.map(toPublic);
    },

    async getHistory(limit) {
        return (await this.search({}, 1, limit)).records;
    },

    async count() {
        if (!useInflux) return memory.length;
        return influxCount({});
    }
};

module.exports = store;
