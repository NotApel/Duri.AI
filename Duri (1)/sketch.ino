#include <WiFi.h>
#include <PubSubClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ArduinoJson.h>


// WiFi settings (Wokwi default)
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// MQTT broker
const char* mqtt_server = "broker.hivemq.com";

WiFiClient espClient;
PubSubClient client(espClient);

Adafruit_MPU6050 mpu;


// LEDs
#define CAMERA_LED 18
#define ALERT_LED 19


// Vibration threshold
float vibrationThreshold = 1.8;


void connectWiFi()
{
  Serial.print("Connecting WiFi");

  WiFi.begin(ssid,password);

  while(WiFi.status()!=WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
}


void connectMQTT()
{
  while(!client.connected())
  {
    Serial.println("Connecting MQTT...");

    if(client.connect("DuriAI-ESP32"))
    {
      Serial.println("MQTT Connected");
    }
    else
    {
      delay(2000);
    }
  }
}



void setup()
{
  Serial.begin(115200);


  pinMode(CAMERA_LED,OUTPUT);
  pinMode(ALERT_LED,OUTPUT);


  connectWiFi();

  client.setServer(mqtt_server,1883);


  if(!mpu.begin())
  {
    Serial.println("MPU6050 Failed");
    while(1);
  }


  Serial.println("Duri.AI System Ready");
}



void loop()
{

  if(!client.connected())
  {
    connectMQTT();
  }

  client.loop();



  sensors_event_t accel;
  sensors_event_t gyro;
  sensors_event_t temp;


  mpu.getEvent(&accel,&gyro,&temp);



  float x = accel.acceleration.x;
  float y = accel.acceleration.y;
  float z = accel.acceleration.z;


  float magnitude =
  sqrt(
    x*x+
    y*y+
    z*z
  ) / 9.81;


  Serial.print("Acceleration: ");
  Serial.print(magnitude);
  Serial.println(" g");



  if(magnitude > vibrationThreshold)
  {

    Serial.println("======================");
    Serial.println("VIBRATION DETECTED");
    Serial.println("Camera Activated");
    

    digitalWrite(CAMERA_LED,HIGH);


    Serial.println("Image Captured");


    StaticJsonDocument<200> data;


    data["device"]="DuriAI";
    data["event"]="Durian Detected";
    data["camera"]="capture";


    char buffer[200];

    serializeJson(data,buffer);


    client.publish(
      "duriai/camera",
      buffer
    );


    digitalWrite(ALERT_LED,HIGH);


    delay(1000);


    digitalWrite(CAMERA_LED,LOW);
    digitalWrite(ALERT_LED,LOW);


    Serial.println("Upload Complete");
    Serial.println("======================");

  }


  delay(500);

}