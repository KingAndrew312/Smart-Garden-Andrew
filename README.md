# Smart Garden – ESP32 Water Level Monitor

Dashboard: **https://smart-garden-andrew.vercel.app**

Alur data:

```
ESP32 --POST /api/sensor--> Vercel API --> Upstash Redis (penyimpanan)
                                 ^
Dashboard (browser) --GET /api/sensor/history-----+
```

ESP32 yang **mengirim** data ke Vercel, karena server Vercel tidak bisa menjangkau IP lokal ESP32 (mis. `192.168.1.50`).

## Endpoint API

Base URL: `https://smart-garden-andrew.vercel.app`

| Method | Endpoint | Dipakai oleh | Keterangan |
|---|---|---|---|
| POST | `/api/sensor` | ESP32 | Kirim data sensor, response berisi `pump_command` |
| GET | `/api/sensor/latest` | Dashboard | Data sensor terbaru |
| GET | `/api/sensor/history?limit=30` | Dashboard | Riwayat data (terbaru dulu, maks 1000) |
| POST | `/api/pump/command` | Dashboard | Set perintah pompa (`pump_on` / `pump_off`) |
| GET | `/api/pump/status` | ESP32 / Dashboard | Cek perintah pompa saat ini |

### POST `/api/sensor`

URL lengkap: `https://smart-garden-andrew.vercel.app/api/sensor`

Header:
```
Content-Type: application/json
```

Body:
```json
{
  "water_level_percent": 55,
  "water_depth_cm": 30,
  "volume_liters": 120,
  "rssi": -60
}
```
`water_level_percent` wajib, field lain opsional.

Response:
```json
{ "status": "success", "message": "Data berhasil disimpan", "pump_command": "pump_off" }
```

### GET `/api/sensor/latest`

```json
{
  "status": "success",
  "record": {
    "water_level_percent": 55,
    "water_depth_cm": 30,
    "volume_liters": 120,
    "rssi": -60,
    "timestamp": "2026-10-19T10:36:59.100Z"
  }
}
```

### GET `/api/sensor/history?limit=30`

```json
{ "status": "success", "records": [ { "...": "sama seperti record di atas" } ] }
```

### POST `/api/pump/command`

Body:
```json
{ "command": "pump_on" }
```

### GET `/api/pump/status`

```json
{ "status": "success", "pump_command": "pump_on" }
```

## Tes cepat dengan curl

```bash
curl -X POST https://smart-garden-andrew.vercel.app/api/sensor \
  -H "Content-Type: application/json" \
  -d '{"water_level_percent":55,"water_depth_cm":30,"volume_liters":120,"rssi":-60}'

curl https://smart-garden-andrew.vercel.app/api/sensor/latest
```

## Setup penyimpanan di Vercel (wajib)

Tanpa database, data di Vercel hilang karena fungsi serverless tidak menyimpan memori antar-request.

1. Buka project di Vercel → tab **Storage** → **Create Database** → pilih **Upstash (Redis)** → hubungkan ke project ini.
2. Vercel otomatis menambahkan env var `KV_REST_API_URL` dan `KV_REST_API_TOKEN` (atau `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; keduanya didukung).
3. **Redeploy** project.

## ESP32

Contoh sketch: [esp32/esp32_sender/esp32_sender.ino](esp32/esp32_sender/esp32_sender.ino)

- Isi `WIFI_SSID` dan `WIFI_PASSWORD`.
- Ganti fungsi `readWaterLevelPercent()` dkk. dengan pembacaan sensor Anda.
- Perintah pompa dari dashboard diterima ESP32 lewat response `pump_command` setiap kali mengirim data.
- Interval default 15 detik. Upstash free tier punya batas jumlah perintah per bulan, jadi jangan mengirim terlalu sering.

## Jalankan lokal

```bash
npm install
npm start
# buka http://localhost:3000
```

Tanpa env var Redis, data disimpan di memori (hanya untuk testing).
