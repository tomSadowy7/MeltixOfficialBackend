#include <WiFi.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <esp_system.h> // for chip id
#include "server.h" 

#define RESET_PIN 0  // GPIO0 for reset-to-provisioning

Preferences prefs;
BLECharacteristic *ssidChar;
BLECharacteristic *passChar;
BLECharacteristic *statusChar;
BLECharacteristic *infoChar;

String receivedSSID = "", receivedPass = "";
bool ssidReady = false, passReady = false;
// please
const int ledPins[4] = {4, 5, 6, 7};

WebServer server(80);
const char* correctKey = "123456";

String deviceUUID = "";
String deviceType = "sprinkler";

// Generate or get persistent UUID (only changes if flash is wiped)
String getDeviceUUID() {
  prefs.begin("wifi", false);
  String uuid = prefs.getString("uuid", "");
  if (uuid == "") {
    uint64_t chipid = ESP.getEfuseMac();
    char buf[40];
    snprintf(buf, sizeof(buf), "%04X-%08X-%08X", (uint16_t)(chipid>>32), (uint32_t)(chipid>>16), (uint32_t)chipid);
    uuid = String(buf);
    prefs.putString("uuid", uuid);
  }
  prefs.end();
  return uuid;
}

String mdnsName() {
  String suffix = deviceUUID.substring(0, 4);  // copy the first 4 chars
  suffix.toLowerCase();                        // mutate in-place (returns void)
  return "esp32-" + suffix;                    // concatenate two Strings
}

void notifyStatus(bool success) {
  if (statusChar) {
    Serial.print("[ESP32] Sending BLE notify: ");
    Serial.println(success ? "CONNECTED" : "FAILED");
    statusChar->setValue(success ? "CONNECTED" : "FAILED");
    statusChar->notify();
  } else {
    Serial.println("[ESP32] statusChar is NULL!");
  }
}

class WifiCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *charac) override {
    String val = charac->getValue().c_str();
    if (charac == ssidChar) {
      receivedSSID = val;
      ssidReady = true;
      Serial.println("SSID received: " + receivedSSID);
    } else if (charac == passChar) {
      receivedPass = val;
      passReady = true;
      Serial.println("Password received");
    }

    if (ssidReady && passReady) {
      prefs.begin("wifi", false);
      prefs.putString("ssid", receivedSSID);
      prefs.putString("pass", receivedPass);
      prefs.end();

      WiFi.begin(receivedSSID.c_str(), receivedPass.c_str());
      Serial.println("Connecting to Wi-Fi...");
      for (int i = 0; i < 10; ++i) {
        if (WiFi.status() == WL_CONNECTED) break;
        delay(1000);
        Serial.print(".");
      }

      bool connected = WiFi.status() == WL_CONNECTED;
      Serial.println(connected ? "\nConnected!" : "\nConnection failed.");

      delay(1000);

      notifyStatus(connected);

      if (connected && infoChar) {
        // Update info characteristic with device info (uuid, name, type)
        StaticJsonDocument<128> doc;
        doc["uuid"] = deviceUUID;
        doc["name"] = "Sprinkler Controller";
        doc["type"] = deviceType;
        String infoStr;
        serializeJson(doc, infoStr);
        infoChar->setValue(infoStr.c_str());
      }

      if (!connected) {
        ssidReady = false;
        passReady = false;
        receivedSSID = "";
        receivedPass = "";
      } else {
        startServer();  // <-- start HTTP endpoints after Wi-Fi provision
      }
    }
  }
};

void handleLEDControl(int pin, bool turnOn) {
  if (!server.hasArg("plain")) {
    server.send(400, "text/plain", "Missing body");
    return;
  }

  String body = server.arg("plain");
  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, body)) {
    server.send(400, "text/plain", "Invalid JSON");
    return;
  }

  const char* key = doc["key"];
  if (key && String(key) == correctKey) {
    digitalWrite(pin, turnOn ? HIGH : LOW);
    server.send(200, "text/plain", turnOn ? "LED turned on" : "LED turned off");
  } else {
    server.send(403, "text/plain", "Unauthorized");
  }
}

void startServer() {
  if (deviceUUID == "") deviceUUID = getDeviceUUID();
  for (int i = 0; i < 4; ++i) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }

  /* Start mDNS with *unique* name */
  if (!MDNS.begin(mdnsName().c_str())) {
      Serial.println("❌ mDNS responder failed");
  } else {
      Serial.printf("🔎 mDNS: http://%s.local\n", mdnsName().c_str());
  }

  // Add routes for each LED
  server.on("/led1/on", HTTP_POST, []() { handleLEDControl(ledPins[0], true); });
  server.on("/led1/off", HTTP_POST, []() { handleLEDControl(ledPins[0], false); });

  server.on("/led2/on", HTTP_POST, []() { handleLEDControl(ledPins[1], true); });
  server.on("/led2/off", HTTP_POST, []() { handleLEDControl(ledPins[1], false); });

  server.on("/led3/on", HTTP_POST, []() { handleLEDControl(ledPins[2], true); });
  server.on("/led3/off", HTTP_POST, []() { handleLEDControl(ledPins[2], false); });

  server.on("/led4/on", HTTP_POST, []() { handleLEDControl(ledPins[3], true); });
  server.on("/led4/off", HTTP_POST, []() { handleLEDControl(ledPins[3], false); });
  server.on("/ping", HTTP_GET, []() {
  server.send(200, "text/plain", "pong");
  });

  server.begin();
  Serial.println("HTTP server started");
}

void startBLE() {
  deviceUUID = getDeviceUUID();
  BLEDevice::init("ESP32-WiFi-Setup");
  BLEServer *server = BLEDevice::createServer();
  BLEService *service = server->createService("0000ffff-0000-1000-8000-00805f9b34fb");

  ssidChar = service->createCharacteristic("0000aaaa-0000-1000-8000-00805f9b34fb", BLECharacteristic::PROPERTY_WRITE);
  passChar = service->createCharacteristic("0000bbbb-0000-1000-8000-00805f9b34fb", BLECharacteristic::PROPERTY_WRITE);
  statusChar = service->createCharacteristic("0000cccc-0000-1000-8000-00805f9b34fb", BLECharacteristic::PROPERTY_NOTIFY);
  infoChar = service->createCharacteristic("0000dddd-0000-1000-8000-00805f9b34fb", BLECharacteristic::PROPERTY_READ);

  ssidChar->setCallbacks(new WifiCallback());
  passChar->setCallbacks(new WifiCallback());

  // On boot, populate info characteristic
  StaticJsonDocument<128> doc;
  doc["uuid"] = deviceUUID;
  doc["name"] = "Sprinkler Controller";
  doc["type"] = deviceType;
  String infoStr;
  serializeJson(doc, infoStr);
  infoChar->setValue(infoStr.c_str());

  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID("0000ffff-0000-1000-8000-00805f9b34fb");
  advertising->start();

  Serial.println("BLE server started. Waiting for credentials...");
}

void setup() {
  Serial.begin(9600);
  pinMode(RESET_PIN, INPUT_PULLUP);

  // Try to connect to saved Wi-Fi
  prefs.begin("wifi", true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  prefs.end();

  if (ssid != "" && pass != "") {
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.println("Connecting to saved Wi-Fi...");
    for (int i = 0; i < 10; ++i) {
      if (WiFi.status() == WL_CONNECTED) break;
      delay(1000);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nWi-Fi connected.");
      startServer();
      return;
    }
    Serial.println("\nConnection failed. Starting BLE...");
  }

  startBLE();
}

void loop() {
  // Reset handling (hold or tap GPIO0 low to clear Wi-Fi and return to BLE)
  if (digitalRead(RESET_PIN) == LOW) {
    Serial.println("Clearing saved Wi-Fi...");
    prefs.begin("wifi", false);
    prefs.clear();
    prefs.end();
    delay(1000);
    ESP.restart();
  }

  server.handleClient();  // Only active if Wi-Fi/server is up
  delay(10);
}
