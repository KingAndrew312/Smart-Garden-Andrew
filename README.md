# Smart Garden – ESP32 + MQTT + InfluxDB (Docker)

Semua berjalan di satu VPS **47.254.170.208** dengan Docker:

| Alamat | Untuk |
|---|---|
| `http://47.254.170.208` | Dashboard & tabel data |
| `ws://47.254.170.208/mqtt` | MQTT WebSocket untuk dashboard (live & kontrol pompa) |
| `mqtt://47.254.170.208:1883` | MQTT untuk ESP32 |

```
ESP32 --publish--> Mosquitto (VPS :1883) --+--> app (listener) --> InfluxDB
  ^      (juga ke broker.hivemq.com)       |
  |                                        +--> Nginx /mqtt --> Dashboard (browser, live)
  +---- binus/garden/pump/cmd <-------------------------------- tombol Auto / ON / OFF
```

| Container | Image | Keterangan |
|---|---|---|
| `mosquitto` | eclipse-mosquitto 2.0 | Broker MQTT. Port 1883 terbuka untuk ESP32, WebSocket 9001 hanya lewat Nginx |
| `influxdb` | influxdb 2.7 | Database time-series. UI hanya di `127.0.0.1:8086` (tidak terbuka ke internet) |
| `app` | build dari `Dockerfile` | Web, API, dan listener MQTT → InfluxDB |
| `nginx` | nginx 1.27 | Port 80: `/` → app, `/mqtt` → Mosquitto WebSocket |

## Data yang ditampilkan

Semua data sensor tampil di dashboard, tabel, dan download, **kecuali**:

- DHT11: `temperature`, `humidity`
- DS18B20 suhu air: `soil_temperature`

Ketiganya tetap disimpan di InfluxDB.

- **Halaman**: `index.html` (dashboard live, grafik, kontrol pompa) dan `data.html` (tabel riwayat dengan pencarian, filter, pagination & download CSV/JSON).
- **Air tandon**: `water_raw` 1 = air ada, 0 = air habis. Firmware tidak mengirim `water_raw`, jadi dihitung dari `is_water_empty`.
- **Tanah kering**: `is_soil_dry` dihitung dari `soil_percent < 35`.
- **Cahaya**: `light_percent`, `light_raw` (LDR), `is_dark` (gelap/terang), `led_d2`.

## Deploy di VPS

Butuh Docker + Docker Compose di VPS. Buka port **80** dan **1883** di firewall / security group VPS.

```bash
git clone <repo> smart-garden && cd smart-garden
cp .env.example .env
nano .env          # isi INFLUX_PASSWORD (min. 8 karakter) & INFLUX_TOKEN (mis. hasil: openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f app    # harus muncul "[MQTT] Terhubung" lalu "[DB] Tersimpan: ..."
```

Buka `http://47.254.170.208`.

Update setelah ada perubahan kode:

```bash
git pull && docker compose up -d --build app
```

Buka UI InfluxDB dari laptop lewat SSH tunnel:

```bash
ssh -L 8086:localhost:8086 user@47.254.170.208
# lalu buka http://localhost:8086 (login INFLUX_USERNAME / INFLUX_PASSWORD)
```

> `INFLUX_USERNAME`, `INFLUX_PASSWORD`, `INFLUX_ORG`, `INFLUX_BUCKET`, `INFLUX_TOKEN` hanya dipakai saat InfluxDB
> pertama kali dibuat. Untuk menggantinya setelah itu, ubah lewat UI InfluxDB atau hapus volume (`docker compose down -v`, **data hilang**).

## Struktur data InfluxDB

- Bucket: `garden` (`INFLUX_BUCKET`), measurement: `sensor_data`, tag: `device`
- Field: `soil_percent`, `soil_raw`, `soil_temperature`, `temperature`, `humidity`, `water_raw`, `water_level_status`,
  `is_water_empty`, `is_soil_dry`, `pump_status`, `pump_command`, `light_raw`, `light_percent`, `is_dark`, `led_d2`

## Jalankan di laptop (tanpa Docker)

```bash
npm install
npm start      # http://localhost:3000
```

Tanpa `INFLUX_URL` di `.env`, data disimpan di memori (hilang saat server berhenti). Untuk memakai broker & database
di VPS dari laptop, isi `MQTT_URL`, `MQTT_WS_URL`, dan `INFLUX_URL` di `.env` (lihat `.env.example`).

## Endpoint API

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/status` | Jenis database & jumlah data tersimpan |
| GET | `/api/sensor/latest` | Data terbaru |
| GET | `/api/sensor/history?page=1&per_page=10` | Riwayat data dengan filter & pagination (terbaru dulu, `per_page` maks 1000) |
| GET | `/api/sensor/export` | Semua data sesuai filter (terlama dulu), dipakai tombol download |
| POST | `/api/sensor` | Simpan data lewat HTTP (opsional, untuk testing). Body sama dengan payload MQTT ESP32 |
| GET | `/config.js` | Alamat MQTT WebSocket untuk dashboard (`MQTT_WS_URL`) |

Filter (berlaku untuk `history` dan `export`):

| Parameter | Nilai | Keterangan |
|---|---|---|
| `q` | teks | Cari di soil %, soil raw, status air, status pompa, cahaya %, LDR raw, LED D2 |
| `from` / `to` | tanggal ISO | Data dari `from` (termasuk) sampai sebelum `to` |
| `soil` | `dry` / `wet` | Tanah kering / lembab |
| `water` | `empty` / `ok` | `water_raw` 0 (habis) / 1 (ada) |
| `pump` | `ON` / `OFF` | Status pompa |
| `light` | `dark` / `bright` | Gelap / terang |

Response `history`: `{ total_all, total, page, per_page, pages, records }` (`total` = jumlah data sesuai filter).

## ESP32

Sketch: [esp32/smart_garden_mqtt/smart_garden_mqtt.ino](esp32/smart_garden_mqtt/smart_garden_mqtt.ino)

- Isi `ssid` dan `password` WiFi.
- Library: PubSubClient, ArduinoJson (v7), DHT sensor library, Adafruit SSD1306, Adafruit GFX, OneWire, DallasTemperature.
- Publish tiap 10 detik ke Mosquitto VPS (`47.254.170.208:1883`) **dan** `broker.hivemq.com`.
  Yang disimpan ke InfluxDB hanya data dari broker VPS, jadi tidak dobel.

## Keamanan

Mosquitto masih `allow_anonymous true` (ESP32 belum memakai username/password), jadi siapa pun yang tahu IP & topik
bisa membaca data atau mengirim perintah pompa. Untuk produksi: aktifkan password Mosquitto (`mosquitto_passwd`),
isi `mqtt_user` / `mqtt_password` di ESP32, dan pasang domain + HTTPS di Nginx.
