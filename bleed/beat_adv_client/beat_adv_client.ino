

#include <ArduinoBLE.h>

#define LOGGING 1

const int ledPin = LED_BUILTIN;  // pin to use for the LED
int bpm = 120;
unsigned long startTime = 0;
int attack = 100;
int release = 600;
unsigned long ledLastUpdate = 0;

float frand() {
  return (float)rand() / (float)RAND_MAX;
}

int getBeatPeriod(int bpm) {
  return 60000 / bpm;
}

int getLastBeatOffset(unsigned long currentOffset, int period) {
  // quantize to beat, rounding down (floor), then interpolate back to ms
  return (currentOffset / period) * period;
}

float easeInCube(float n) {
  return n * n * n;
}

float curve(float n, float attack, float release) {
  if (n < -attack)
    return 0;
  if (n > release)
    return 0;
  return n < 0 ? easeInCube(n / (float)attack + 1.0f)
               : easeInCube(1.0f - n / (float)release);
}

float sampleBeatIntensity(int beatTime, unsigned long currentOffset) {
  int t = currentOffset - beatTime;

  float curveY = curve(t, attack, release);

  return fmaxf(0.0f, curveY);
}

float getIntensity(unsigned long now) {
  unsigned long currentOffset = now - startTime;
  int period = getBeatPeriod(bpm);
  int lastBeat = getLastBeatOffset(currentOffset, period);
  int nextBeat = lastBeat + period;

  return fminf(1.0f, (sampleBeatIntensity(lastBeat, currentOffset) +
                      sampleBeatIntensity(nextBeat, currentOffset)));
}

void setRGBLEDEnabled(bool on) {
  pinMode(LED_PWR, OUTPUT);
  digitalWrite(LED_PWR, on ? HIGH : LOW);
}
void setRGBLEDColor(float red, float green, float blue) {
  pinMode(LEDR, OUTPUT);
  analogWrite(LEDR, 255 * (1.0f - red));  // Cathode tied to +3V3
  pinMode(LEDG, OUTPUT);
  analogWrite(LEDG, 255 * (1.0f - green));
  pinMode(LEDB, OUTPUT);
  analogWrite(LEDB, 255 * (1.0f - blue));
}

void setup() {
#if LOGGING
  Serial.begin(115200);
  while (!Serial)
    ;
#endif

  // set LED pin to output mode
  pinMode(ledPin, OUTPUT);

  digitalWrite(ledPin, HIGH);  // will turn the LED on
  delay(500);
  digitalWrite(ledPin, LOW);  // will turn the LED off

  setRGBLEDEnabled(true);

  // begin initialization
  if (!BLE.begin()) {
#if LOGGING
    Serial.println("starting BLE failed!");
#endif

    while (1)
      ;
  }

#if LOGGING
  Serial.println("BLE Central scan");
#endif

  // start scanning for peripheral
  BLE.scan();
  // BLE.scanForUuid("b0ef", true);
  // BLE.scanForUuid("B0EF", true);

  // init music code
  startTime = millis();
}

// when we pack data into the UUID hex string, each index represents 4 bits, so
// to get the string offset of a particular byte offset we multiply by 2
#define hexByte(x) x * 2

String undashUUID(String& uuid) {
  String undashed;
  undashed.reserve(32);
  for (int i = 0; i < uuid.length(); ++i) {
    char curr = uuid.charAt(i);
    if (curr != '-') {
      undashed += curr;
    }
  }
  return undashed;
}

void loop() {
  unsigned long now = millis();

  if (ledLastUpdate - now > 16) {
    float intensity = getIntensity(now) * 0.5f;

#if LOGGING
    // Serial.printf("intensity: %f\n", intensity);
#endif
    setRGBLEDColor(intensity, intensity, intensity);
    // delay(16);
    ledLastUpdate = now;
  }

  unsigned long startBLE = millis();
  BLEDevice peripheral = BLE.available();
  bool isBleedBroadcast = false;
  String thePacket;

  if (peripheral) {
#if LOGGING
    Serial.print("peripheral:");
    Serial.print(peripheral.address());
    Serial.println();
#endif
    if (peripheral.hasAdvertisedServiceUuid()) {
#if LOGGING
      Serial.print("Service UUIDs: ");
#endif
      for (int i = 0; i < (int)peripheral.advertisedServiceUuidCount(); i++) {
#if LOGGING
        Serial.print(peripheral.advertisedServiceUuid(i));
        Serial.print(" ");
#endif
        if (peripheral.advertisedServiceUuid(i) == "b0ef") {
          isBleedBroadcast = true;
        } else {
          thePacket = peripheral.advertisedServiceUuid(i);
        }
      }

#if LOGGING
      Serial.println();
#endif
    }
    if (isBleedBroadcast) {
      String advPacket = undashUUID(thePacket);
#if LOGGING
      Serial.printf("parsing: %s\n", advPacket.c_str());
#endif
      unsigned long newStartTime = strtoul(
          advPacket.substring(hexByte(0), hexByte(4)).c_str(), NULL, 16);
      unsigned char newBPM = strtoul(
          advPacket.substring(hexByte(4), hexByte(5)).c_str(), NULL, 16);

      unsigned long endBLE = millis();
#if LOGGING
      Serial.printf("bpm:%u startTime:%lu took:%lu", newBPM, newStartTime,
                    endBLE - startBLE);
#endif
    }
  }
}

float lerp(float v0, float v1, float t) {
  return v0 + t * (v1 - v0);
}

// Rainbow cycle along whole strip. Pass delay time (in ms) between frames.
// void transitionGradient(int wait) {
//   // Hue of first pixel runs 5 complete loops through the color wheel.
//   // Color wheel has a range of 65536 but it's OK if we roll over, so
//   // just count from 0 to 5*65536. Adding 256 to firstPixelHue each time
//   // means we'll make 5*65536/256 = 1280 passes through this outer loop:
//   for (long firstPixelHue = 0; firstPixelHue < 5 * 65536;
//        firstPixelHue += 256) {
//     for (int i = 0; i < strip.numPixels(); i++) {  // For each pixel in
//     strip...
//       // Offset pixel hue by an amount to make one full revolution of the
//       // color wheel (range of 65536) along the length of the strip
//       // (strip.numPixels() steps):
//       int pixelHue = firstPixelHue + (i * 65536L / strip.numPixels());
//       // strip.ColorHSV() can take 1 or 3 arguments: a hue (0 to 65535) or
//       // optionally add saturation and value (brightness) (each 0 to 255).
//       // Here we're using just the single-argument hue variant. The result
//       // is passed through strip.gamma32() to provide 'truer' colors
//       // before assigning to each pixel:
//       strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue)));
//     }
//     strip.show();  // Update strip with new contents
//     delay(wait);   // Pause for a moment
//   }
// }
