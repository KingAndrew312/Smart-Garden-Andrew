// Contoh ESP32: kirim data sensor ke Vercel & terima perintah pompa
// Library: ArduinoJson (v7) — install lewat Library Manager
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID     = "NAMA_WIFI";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

const char* API_URL = "https://smart-garden-andrew.vercel.app/api/sensor";

const int PUMP_PIN = 26;                   // sesuaikan pin relay pompa
const unsigned long SEND_INTERVAL = 15000; // kirim tiap 15 detik

unsigned long lastSend = 0;

// ===== Ganti dengan pembacaan sensor Anda =====
float readWaterLevelPercent() { return 50.0; }
float readWaterDepthCm()      { return 25.0; }
float readVolumeLiters()      { return 100.0; }

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menghubungkan WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nTerhubung, IP: " + WiFi.localIP().toString());
}

void sendData() {
  WiFiClientSecure client;
  client.setInsecure(); // lewati verifikasi sertifikat (cukup untuk proyek hobi)

  HTTPClient http;
  http.begin(client, API_URL);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["water_level_percent"] = readWaterLevelPercent();
  doc["water_depth_cm"]      = readWaterDepthCm();
  doc["volume_liters"]       = readVolumeLiters();
  doc["rssi"]                = WiFi.RSSI();

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 200) {
    JsonDocument res;
    if (!deserializeJson(res, http.getString())) {
      const char* cmd = res["pump_command"] | "pump_off";
      digitalWrite(PUMP_PIN, strcmp(cmd, "pump_on") == 0 ? HIGH : LOW);
      Serial.printf("Terkirim. Perintah pompa: %s\n", cmd);
    }
  } else {
    Serial.printf("Gagal kirim, HTTP %d\n", code);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(PUMP_PIN, LOW);
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  if (millis() - lastSend >= SEND_INTERVAL || lastSend == 0) {
    lastSend = millis();
    sendData();
  }
}
