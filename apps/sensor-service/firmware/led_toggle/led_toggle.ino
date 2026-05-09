/**
 * Test firmware for @real-pendulum/sensor-service.
 * Upload to your Arduino, then set SENSOR_SERIAL_PORT (e.g. COM3) and start sensor-service.
 *
 * Protocol (115200 baud, newline-delimited):
 *   PC -> board: "TOGGLE\n"
 *   board -> PC: "LED:0\n" or "LED:1\n"
 *   PC -> board: "RESET_ENC\n" — zero encoder counter; board -> PC: "ZERO:OK\n" then "ENC:0\n"
 *
 * Rotary encoder (quadrature): CLK/A -> D2, DT/B -> D3 (interrupt pins on Uno).
 * Board -> PC: "ENC:<count>\n" whenever the integral position changes (signed tick count).
 *
 * Limit switches (INPUT_PULLUP, closed to GND when active): left -> D4, right -> D5.
 * Board -> PC: "LIM:<0|1>,<0|1>\n" (left,right) when either changes — 1 = pressed/active (LOW).
 */
const int LED_PIN = LED_BUILTIN;
const int ENC_PIN_A = 2;
const int ENC_PIN_B = 3;
const int LIMIT_LEFT_PIN = 4;
const int LIMIT_RIGHT_PIN = 5;

bool ledOn = false;

volatile long encoderPosition = 0;
long lastEncSent = 0;

void encoderISR() {
  static uint8_t oldAB = 3;
  uint8_t AB = (digitalRead(ENC_PIN_A) << 1) | digitalRead(ENC_PIN_B);
  uint8_t idx = (oldAB << 2) | AB;
  static const int8_t encStates[] = {
    0, -1, 1, 0,
    1, 0, 0, -1,
    -1, 0, 0, 1,
    0, 1, -1, 0
  };
  /* Subtract so clockwise knob motion matches increasing ENC ticks / dial angle for this wiring. */
  encoderPosition -= encStates[idx];
  oldAB = AB;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(ENC_PIN_A, INPUT_PULLUP);
  pinMode(ENC_PIN_B, INPUT_PULLUP);
  pinMode(LIMIT_LEFT_PIN, INPUT_PULLUP);
  pinMode(LIMIT_RIGHT_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_PIN_A), encoderISR, CHANGE);
  attachInterrupt(digitalPinToInterrupt(ENC_PIN_B), encoderISR, CHANGE);
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
    } else if (line.equalsIgnoreCase("RESET_ENC")) {
      noInterrupts();
      encoderPosition = 0;
      interrupts();
      lastEncSent = 0;
      Serial.println("ZERO:OK");
      Serial.print("ENC:");
      Serial.println((long)0);
    }
  }

  long now = encoderPosition;
  if (now != lastEncSent) {
    Serial.print("ENC:");
    Serial.println(now);
    lastEncSent = now;
  }

  bool lp = digitalRead(LIMIT_LEFT_PIN) == LOW;
  bool rp = digitalRead(LIMIT_RIGHT_PIN) == LOW;
  uint8_t limPacked = (lp ? 1u : 0u) | ((rp ? 1u : 0u) << 1);
  static uint8_t lastLimPacked = 4;
  if (limPacked != lastLimPacked) {
    Serial.print("LIM:");
    Serial.print(lp ? '1' : '0');
    Serial.print(',');
    Serial.println(rp ? '1' : '0');
    lastLimPacked = limPacked;
  }
}
