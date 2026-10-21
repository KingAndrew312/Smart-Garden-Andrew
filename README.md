# Smart Garden – ESP32 + MQTT

Dashboard: **https://smart-garden-andrew.vercel.app**

Alur data:

```
ESP32 --publish binus/garden/sensor/data--> broker.hivemq.com
                                              |            |
                       (WebSocket, live)      |            |  (TCP)
                Dashboard (browser) <---------+            +---> MQTT listener (npm start / npm run listen)
                       |  publish binus/garden/pump/cmd                 |
                       v                                                v
                     ESP32                                    MySQL database "peter"
                                                                        |
                Dashboard <--- GET /api/sensor/history, /api/sensor/export
```

- **Data live** & **kontrol pompa** (`auto` / `pump_on` / `pump_off`) langsung lewat MQTT dari browser.
- **Penyimpanan**: listener MQTT menyimpan setiap data ke MySQL database `peter`, tabel `sensor_data`.
- **Halaman**: `index.html` (dashboard live, grafik, kontrol pompa) dan `data.html` (tabel riwayat dengan pencarian, filter, pagination & download).
- **Air tandon**: `water_raw` 1 = air ada, 0 = air habis (float switch).
- **Tampil & download**: semua field ditampilkan dan bisa di-download (CSV / JSON) **kecuali data DHT11**
  (`temperature`, `humidity`). Data DHT tetap tersimpan di database, hanya tidak ditampilkan / di-download.

> Vercel (serverless) tidak bisa menjalankan subscriber MQTT terus-menerus, jadi listener harus jalan di komputer/server
> yang selalu menyala (mis. `npm start` di laptop dengan XAMPP).

## Jalankan lokal (XAMPP)

1. Jalankan **MySQL** dari XAMPP Control Panel.
2. (Opsional) import [database/peter.sql](database/peter.sql) lewat phpMyAdmin. Kalau tidak, database `peter` dan tabelnya dibuat otomatis.
3. Salin `.env.example` menjadi `.env`, isi `DB_USER` / `DB_PASSWORD` sesuai MySQL Anda.
4. Jalankan:

```bash
npm install
npm start
# buka http://localhost:3000
```

`npm start` menjalankan web + API + listener MQTT sekaligus. Hanya listener: `npm run listen`.

| Env var | Default | Keterangan |
|---|---|---|
| `DB_HOST` | `localhost` | Host MySQL |
| `DB_PORT` | `3306` | |
| `DB_USER` | `root` | |
| `DB_PASSWORD` | *(kosong)* | |
| `DB_NAME` | `peter` | Nama database |
| `MQTT_URL` | `mqtt://broker.hivemq.com:1883` | |
| `MQTT_TOPIC` | `binus/garden/sensor/data` | |
| `MQTT_LISTENER` | `true` | `false` = `npm start` tidak ikut menyimpan data MQTT |

## Endpoint API

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/status` | Jenis database & jumlah data tersimpan |
| GET | `/api/sensor/latest` | Data terbaru |
| GET | `/api/sensor/history?page=1&per_page=10` | Riwayat data dengan filter & pagination (terbaru dulu, `per_page` maks 1000) |
| GET | `/api/sensor/export` | Semua data sesuai filter (terlama dulu), dipakai tombol download |

Filter (berlaku untuk `history` dan `export`):

| Parameter | Nilai | Keterangan |
|---|---|---|
| `q` | teks | Cari di device, tanaman, soil %, soil raw, status air, status pompa, perintah |
| `from` / `to` | tanggal ISO | Data dari `from` (termasuk) sampai sebelum `to` |
| `soil` | `dry` / `wet` | Tanah kering / lembab |
| `water` | `empty` / `ok` | Air tandon habis / ada |
| `pump` | `ON` / `OFF` | Status pompa |

Response `history`: `{ total_all, total, page, per_page, pages, records }` (`total` = jumlah data sesuai filter).
| POST | `/api/sensor` | Simpan data lewat HTTP (opsional, untuk testing). Body sama dengan payload MQTT ESP32 |

Contoh record (tanpa `temperature` / `humidity`):

```json
{
  "id": 1,
  "timestamp": "2026-10-21T13:06:48.999Z",
  "device_id": "ESP32-BAMER-01",
  "tanaman": "bawang_merah",
  "soil_percent": 22,
  "soil_raw": 2700,
  "is_soil_dry": true,
  "water_raw": 0,
  "water_level_status": "EMPTY",
  "is_water_empty": true,
  "pump_status": "OFF",
  "relay_d23": false,
  "pump_command": "auto",
  "pump_command_local": "auto"
}
```

## Vercel

Dashboard di Vercel tetap menampilkan data live lewat MQTT. Agar riwayat & download dari database jalan di Vercel,
isi env var `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` dengan MySQL yang bisa diakses dari internet
(MySQL lokal XAMPP tidak bisa dijangkau Vercel). Tanpa `DB_HOST`, API di Vercel memakai memori (hanya untuk testing),
dan tombol download memakai data yang diterima dashboard selama halaman terbuka.

## ESP32

Sketch: [esp32/smart_garden_mqtt/smart_garden_mqtt.ino](esp32/smart_garden_mqtt/smart_garden_mqtt.ino)

- Isi `ssid` dan `password` WiFi.
- Library: PubSubClient, ArduinoJson (v7), DHT sensor library, Adafruit SSD1306, Adafruit GFX.
- Publish data tiap 10 detik ke `binus/garden/sensor/data`, menerima perintah pompa dari `binus/garden/pump/cmd`.

> `broker.hivemq.com` adalah broker publik: siapa pun yang tahu nama topik bisa membaca / mengirim data.
> Cocok untuk prototipe; untuk produksi gunakan broker pribadi dengan username/password.
