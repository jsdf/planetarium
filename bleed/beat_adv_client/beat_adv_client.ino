

#include <ArduinoBLE.h>
#include <float.h>

#define LOGGING 1

const int ledPin = LED_BUILTIN;  // pin to use for the LED
int bpm = 120;
int startTime = 0;
int serverTimeDelta = 0;
bool hasServerTimeDelta = false;
int attack = 1;
int release = 500;
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
  unsigned long currentOffset = (now + serverTimeDelta) - (startTime);
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
  // BLE.scan();
  BLE.scanForUuid("b0ef", true);
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

typedef struct TimeSync {
  float client_receive_time;
  float round_trip_time;
  float offset;
} TimeSync;

#define NTP_SAMPLES 30

void syncTime(BLEDevice& peripheral) {
#if LOGGING
  Serial.println("Connecting ...");
#endif
  if (!peripheral.connect()) {
#if LOGGING
    Serial.println("Failed to connect!");
#endif
    return;
  }

#if LOGGING
  Serial.println("Connected");
#endif

#if LOGGING
  Serial.println("Discovering service attributes ...");
#endif
  if (peripheral.discoverService("b0ef")) {
#if LOGGING
    Serial.println("Service attributes discovered");
#endif
  } else {
#if LOGGING
    Serial.println("Service attribute discovery failed!");
#endif
    peripheral.disconnect();
    return;
  }

  BLEService primaryService = peripheral.service("b0ef");
  // try to use syncTimeCharacterisic
  BLECharacteristic syncTimeCharacterisic =
      primaryService.characteristic("feab");
  // peripheral.characteristic("feab");
  if (!syncTimeCharacterisic) {
#if LOGGING
    Serial.println("Peripheral does NOT have syncTimeCharacterisic");
#endif
    peripheral.disconnect();
    return;
  }

  TimeSync timeSync[NTP_SAMPLES];
  for (int i = 0; i < NTP_SAMPLES; ++i) {
    int32_t serverTime = 0;
    unsigned long beforeSync = millis();
    syncTimeCharacterisic.readValue(serverTime);
    unsigned long afterSync = millis();

    if (serverTime == 0) {
      timeSync[i].client_receive_time = 0;
#if LOGGING
      Serial.printf("error reading time on sync: %d\n", i);
#endif
    } else {
      timeSync[i].client_receive_time = afterSync;
      timeSync[i].round_trip_time = afterSync - beforeSync;
      timeSync[i].offset =
          serverTime - (beforeSync + (timeSync[i].round_trip_time / 2));
    }
    delay(10);
  }

  double offset_total = 0;
  double rt_total = 0;
  int missing_samples = 0;
  double max_rtt = 0;
  double min_rtt = DBL_MAX;

  for (int i = 0; i < NTP_SAMPLES; i++) {
    if (timeSync[i].client_receive_time != 0) {
      offset_total += timeSync[i].offset;
      rt_total += timeSync[i].round_trip_time;
      max_rtt = fmax(max_rtt, timeSync[i].round_trip_time);
      min_rtt = fmin(min_rtt, timeSync[i].round_trip_time);
    } else {
      missing_samples++;
    }
  }
  double time_sync_correction = (offset_total / (double)NTP_SAMPLES);
  double time_sync_round_trip = (rt_total / (double)NTP_SAMPLES);

  // calculate diff between server and local time
  // which we can use to adjust times received from the server later
  serverTimeDelta = (int)time_sync_correction;
#if LOGGING
  Serial.printf(
      "time_sync_correction:%f time_sync_round_trip:%f missing_samples:%d\n",
      time_sync_correction, time_sync_round_trip, missing_samples);
#endif
  hasServerTimeDelta = true;
}

int lastHeartbeat = 0;

void loop() {
  unsigned long now = millis();

  if (now / 10000 > lastHeartbeat) {
    lastHeartbeat = now / 10000;

#if LOGGING
    Serial.printf("i'm alive: %d\n", lastHeartbeat);
#endif
  }

  now = millis();
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
    // Serial.print("peripheral:");
    // Serial.print(peripheral.address());
    // Serial.println();
#endif
    if (peripheral.hasAdvertisedServiceUuid()) {
#if LOGGING
      // Serial.print("Service UUIDs: ");
#endif
      for (int i = 0; i < (int)peripheral.advertisedServiceUuidCount(); i++) {
#if LOGGING
        // Serial.print(peripheral.advertisedServiceUuid(i));
        // Serial.print(" ");
#endif
        if (peripheral.advertisedServiceUuid(i) == "b0ef") {
          isBleedBroadcast = true;
        } else {
          thePacket = peripheral.advertisedServiceUuid(i);
        }
      }

      if (isBleedBroadcast && !hasServerTimeDelta) {
        BLE.stopScan();
        syncTime(peripheral);
        BLE.scanForUuid("b0ef", true);
      }

#if LOGGING
      // Serial.println();
#endif
    }
    if (isBleedBroadcast) {
      String advertismentPacket = undashUUID(thePacket);
      if (advertismentPacket.charAt(0) == 'f') {
        return;
      }
      int newStartTime =
          strtol(advertismentPacket.substring(hexByte(0), hexByte(4)).c_str(),
                 NULL, 16);
      unsigned char newBPM =
          strtoul(advertismentPacket.substring(hexByte(4), hexByte(5)).c_str(),
                  NULL, 16);

      unsigned long endBLE = millis();

#if LOGGING
      if (bpm != newBPM) {
        Serial.printf("parsed: %s from: %s\n", advertismentPacket.c_str(),
                      peripheral.address().c_str());
        Serial.printf("bpm:%u startTime:%d took:%lu\n", newBPM, newStartTime,
                      endBLE - startBLE);
      }
#endif
      bool updatedValues = false;
      if (newBPM > 10 && newBPM < 255) {
        bpm = newBPM;
        updatedValues = true;
      }
      if (startTime != newStartTime) {
        startTime = newStartTime;
        updatedValues = true;
      }

      if (updatedValues) {
        // dumb shit to make the BLE layer find any new advertisements asap
        BLE.stopScan();
        BLE.scanForUuid("b0ef", true);
      }
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
