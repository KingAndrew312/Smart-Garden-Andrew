const mysql = require('mysql2/promise');
const { toPublic } = require('./fields');

// Baca .env (lokal) bila ada; di Vercel env var diisi lewat dashboard
try { process.loadEnvFile(); } catch { /* tidak ada .env */ }

// ===== Database MySQL "peter" =====
// Lokal (XAMPP): default localhost:3306, user root tanpa password.
// Database & tabel dibuat otomatis saat pertama kali dipakai.
// Di Vercel: isi env var DB_HOST, DB_PORT, DB_USER, DB_PASSWORD (MySQL yang bisa diakses dari internet).
// Tanpa DB_HOST di Vercel: fallback ke memori (data hilang antar-request, hanya untuk testing).
const DB_NAME = process.env.DB_NAME || 'peter';
const TABLE = 'sensor_data';
const useMySQL = Boolean(process.env.DB_HOST) || !process.env.VERCEL;
const MEMORY_MAX = 1000;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(50) NULL,
    tanaman VARCHAR(50) NULL,
    soil_percent INT NULL,
    soil_raw INT NULL,
    temperature FLOAT NULL,
    humidity FLOAT NULL,
    water_raw TINYINT NULL,
    water_level_status VARCHAR(10) NULL,
    is_water_empty TINYINT(1) NOT NULL DEFAULT 0,
    is_soil_dry TINYINT(1) NOT NULL DEFAULT 0,
    pump_status VARCHAR(5) NULL,
    relay_d23 TINYINT(1) NOT NULL DEFAULT 0,
    pump_command VARCHAR(10) NULL,
    pump_command_local VARCHAR(10) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_created_at (created_at)
)`;

// Kolom yang dicari oleh kotak pencarian (hanya kolom yang tampil di tabel)
const SEARCH_COLUMNS = ['device_id', 'tanaman', 'soil_percent', 'soil_raw', 'water_level_status', 'pump_status'];

// filters: { q, from, to (Date), soil: 'dry'|'wet', water: 'empty'|'ok', pump: 'ON'|'OFF' }
function buildWhere(f = {}) {
    const where = [];
    const params = [];
    if (f.from) { where.push('created_at >= ?'); params.push(f.from); }
    if (f.to) { where.push('created_at < ?'); params.push(f.to); }
    if (f.soil) { where.push('is_soil_dry = ?'); params.push(f.soil === 'dry' ? 1 : 0); }
    // float switch: water_raw 1 = air ada, 0 = air habis
    if (f.water) { where.push('water_raw = ?'); params.push(f.water === 'empty' ? 0 : 1); }
    if (f.pump) { where.push('pump_status = ?'); params.push(f.pump); }
    if (f.q) {
        const like = `%${f.q.replace(/[\\%_]/g, '\\$&')}%`;
        where.push(`(${SEARCH_COLUMNS.map((c) => `CAST(${c} AS CHAR) LIKE ?`).join(' OR ')})`);
        params.push(...SEARCH_COLUMNS.map(() => like));
    }
    return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Versi buildWhere untuk penyimpanan memori
function matches(row, f = {}) {
    if (f.from && row.created_at < f.from) return false;
    if (f.to && row.created_at >= f.to) return false;
    if (f.soil && row.is_soil_dry !== (f.soil === 'dry')) return false;
    if (f.water && row.water_raw !== (f.water === 'empty' ? 0 : 1)) return false;
    if (f.pump && row.pump_status !== f.pump) return false;
    if (f.q) {
        const q = f.q.toLowerCase();
        return SEARCH_COLUMNS.some((c) => row[c] !== null && String(row[c]).toLowerCase().includes(q));
    }
    return true;
}

let poolPromise = null;
const memory = [];
let memoryId = 0;

async function createPool() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    };

    // Buat database "peter" bila belum ada (diabaikan kalau user tidak punya hak CREATE DATABASE)
    try {
        const conn = await mysql.createConnection(config);
        await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        await conn.end();
    } catch (err) {
        console.warn(`[DB] Tidak bisa membuat database ${DB_NAME}: ${err.message}`);
    }

    const pool = mysql.createPool({ ...config, database: DB_NAME, connectionLimit: 5 });
    await pool.query(CREATE_TABLE);
    console.log(`[DB] Terhubung ke MySQL ${config.host}:${config.port}/${DB_NAME}`);
    return pool;
}

function getPool() {
    if (!poolPromise) {
        poolPromise = createPool().catch((err) => {
            poolPromise = null; // coba lagi di request berikutnya
            throw err;
        });
    }
    return poolPromise;
}

const store = {
    type: useMySQL ? 'mysql' : 'memory',
    name: DB_NAME,

    // Simpan satu data sensor (hasil fields.normalize)
    async addReading(row) {
        if (!useMySQL) {
            memory.unshift({ id: ++memoryId, ...row });
            memory.length = Math.min(memory.length, MEMORY_MAX);
            return;
        }
        const pool = await getPool();
        await pool.query(`INSERT INTO \`${TABLE}\` SET ?`, row);
    },

    // Data terbaru (urutan: terbaru dulu)
    async getHistory(limit) {
        if (!useMySQL) return memory.slice(0, limit).map(toPublic);
        const pool = await getPool();
        const [rows] = await pool.query(`SELECT * FROM \`${TABLE}\` ORDER BY id DESC LIMIT ?`, [limit]);
        return rows.map(toPublic);
    },

    // Data untuk tabel: filter + pencarian + pagination (urutan: terbaru dulu)
    async search(filters, page, perPage) {
        const offset = (page - 1) * perPage;
        if (!useMySQL) {
            const rows = memory.filter((row) => matches(row, filters));
            return { total: rows.length, records: rows.slice(offset, offset + perPage).map(toPublic) };
        }
        const pool = await getPool();
        const { sql, params } = buildWhere(filters);
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM \`${TABLE}\` ${sql}`, params);
        const [rows] = await pool.query(
            `SELECT * FROM \`${TABLE}\` ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`,
            [...params, perPage, offset]
        );
        return { total, records: rows.map(toPublic) };
    },

    // Semua data (sesuai filter) untuk download (urutan: terlama dulu)
    async getAll(filters) {
        if (!useMySQL) return memory.filter((row) => matches(row, filters)).reverse().map(toPublic);
        const pool = await getPool();
        const { sql, params } = buildWhere(filters);
        const [rows] = await pool.query(`SELECT * FROM \`${TABLE}\` ${sql} ORDER BY id ASC`, params);
        return rows.map(toPublic);
    },

    async count() {
        if (!useMySQL) return memory.length;
        const pool = await getPool();
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM \`${TABLE}\``);
        return total;
    }
};

module.exports = store;
