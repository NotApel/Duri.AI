#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ArduinoJson.h>

// WiFi settings
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// Backend API Endpoint (Nota: Wokwi tak boleh access localhost, ini untuk real hardware)
const char* serverName = "http://192.168.1.100:3000/api/sensor-readings"; // Ganti IP ni nanti
const char* apiKey = "duri-ai-device-secret-2026";

Adafruit_MPU6050 mpu;

// LEDs
#define CAMERA_LED 18
#define ALERT_LED 19

// Threshold (1.8g untuk detect hentakan)
float vibrationThreshold = 1.8;

unsigned long lastDetection = 0;
const unsigned long COOLDOWN_MS = 3000;

void connectWiFi() {
  Serial.print("Connecting WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
}

void setup() {
  Serial.begin(115200);
  pinMode(CAMERA_LED, OUTPUT);
  pinMode(ALERT_LED, OUTPUT);
  
  connectWiFi();

  if (!mpu.begin()) {
    Serial.println("MPU6050 Failed");
    while (1);
  }
  Serial.println("Duri.AI System Ready");
}

void loop() {
  sensors_event_t accel;
  sensors_event_t gyro;
  sensors_event_t temp;
  mpu.getEvent(&accel, &gyro, &temp);

  // Kira magnitude dalam unit 'g'
  float x = accel.acceleration.x;
  float y = accel.acceleration.y;
  float z = accel.acceleration.z;
  float magnitude = sqrt(x*x + y*y + z*z) / 9.81;

  Serial.print("Acceleration: ");
  Serial.print(magnitude);
  Serial.println(" g");

  unsigned long now = millis();
  
  if (magnitude > vibrationThreshold && (now - lastDetection) > COOLDOWN_MS) {
    lastDetection = now;
    
    Serial.println("======================");
    Serial.println("VIBRATION DETECTED");
    
    digitalWrite(CAMERA_LED, HIGH);
    digitalWrite(ALERT_LED, HIGH);

    // Hantar ke Backend
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverName);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-api-key", apiKey);

      // Kira amplitude, frequency, duration (simulasi)
      float amplitude = magnitude * 9.81;
      float frequency = 50.0; // Example constant
      float duration = 1.0;

      StaticJsonDocument<200> doc;
      doc["node_id"] = 1;
      doc["amplitude"] = amplitude;
      doc["frequency"] = frequency;
      doc["duration"] = duration;

      String requestBody;
      serializeJson(doc, requestBody);

      int httpResponseCode = http.POST(requestBody);

      if (httpResponseCode > 0) {
        Serial.print("HTTP Response code: ");
        Serial.println(httpResponseCode);
      } else {
        Serial.print("Error code: ");
        Serial.println(httpResponseCode);
      }
      http.end();
    }

    delay(1000);
    digitalWrite(CAMERA_LED, LOW);
    digitalWrite(ALERT_LED, LOW);
    Serial.println("Upload Complete");
    Serial.println("======================");
  }

  delay(500);
}