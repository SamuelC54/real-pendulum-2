/**
 * Test firmware for @real-pendulum/sensor-service.
 * Upload to your Arduino, then set SENSOR_SERIAL_PORT (e.g. COM3) and start sensor-service.
 *
 * Protocol (115200 baud, newline-delimited):
 *   PC -> board: "TOGGLE\n"
 *   board -> PC: "LED:0\n" or "LED:1\n"
 */
const int LED_PIN = LED_BUILTIN;

bool ledOn = false;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.equalsIgnoreCase("TOGGLE")) {
      ledOn = !ledOn;
      digitalWrite(LED_PIN, ledOn ? HIGH : LOW);
      Serial.print("LED:");
      Serial.println(ledOn ? "1" : "0");
    }
  }
}
