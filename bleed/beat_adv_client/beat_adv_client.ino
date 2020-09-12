

#include <ArduinoBLE.h>
#include <float.h>

#include <utility/GAP.h>

#include <Adafruit_NeoPixel.h>

#include "gradient.h"

#define LOGGING 0
#define BLE_BROADCAST 1

#define USE_BUILTIN_RGB_LED 0
#define USE_NEOPIXEL 1
#define NEOPIXEL_PIN 6  // Pin where NeoPixels are connected

#define PGM_ALTERNATE 2
#define PGM_RAINBOW 3
#define PGM_GRADIENT 4

// Declare our NeoPixel strip object:
Adafruit_NeoPixel strip(64, NEOPIXEL_PIN, NEO_GRB + NEO_KHZ800);
// Argument 1 = Number of pixels in NeoPixel strip
// Argument 2 = Arduino pin number (most are valid)
// Argument 3 = Pixel type flags, add together as needed:
//   NEO_KHZ800  800 KHz bitstream (most NeoPixel products w/WS2812 LEDs)
//   NEO_KHZ400  400 KHz (classic 'v1' (not v2) FLORA pixels, WS2811 drivers)
//   NEO_GRB     Pixels are wired for GRB bitstream (most NeoPixel products)
//   NEO_RGB     Pixels are wired for RGB bitstream (v1 FLORA pixels, not v2)
//   NEO_RGBW    Pixels are wired for RGBW bitstream (NeoPixel RGBW products)

typedef struct TimeSync {
  float client_receive_time;
  float round_trip_time;
  float offset;
} TimeSync;

#define NTP_SAMPLES 30

// when we pack data into the UUID hex string, each index represents 4 bits, so
// to get the string offset of a particular byte offset we multiply by 2
#define hexByte(x) x * 2

const int ledPin = LED_BUILTIN;  // pin to use for the LED
int bpm = 20;
long startTime = 0;
long serverTimeDelta = 0;
bool hasServerTimeDelta = false;
int attack = 2000;
int release = 2000;
int gradient = 0;
int energy = 500;
int program = 0;
unsigned long ledLastUpdate = 0;
int deviceIndex = 0;

float frand() {
  return (float)rand() / (float)RAND_MAX;
}

int getBeatPeriod(int bpm) {
  return 60000 / bpm;
}

long getLastBeatOffset(long currentOffset, int period) {
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

float sampleBeatIntensity(long beatTime, long currentOffset) {
  long t = currentOffset - beatTime;

  float curveY = curve(t, attack, release);

  return fmaxf(0.0f, curveY);
}

float getIntensity(long currentOffset, long period) {
  long lastBeat = getLastBeatOffset(currentOffset, period);
  long nextBeat = lastBeat + period;

  return fminf(1.0f, (sampleBeatIntensity(lastBeat, currentOffset) +
                      sampleBeatIntensity(nextBeat, currentOffset)));
}
#define NEO_BRIGHTNESS_MAX 100

void setRGBLEDEnabled(bool on) {
  if (USE_BUILTIN_RGB_LED) {
    pinMode(LED_PWR, OUTPUT);
    digitalWrite(LED_PWR, on ? HIGH : LOW);
  }
  if (USE_NEOPIXEL) {
    strip.begin();  // INITIALIZE NeoPixel strip object (REQUIRED)
    strip.show();   // Turn OFF all pixels ASAP
    strip.setBrightness(
        NEO_BRIGHTNESS_MAX);  // Set BRIGHTNESS to about 1/5 (max = 255)
  }
}

void setRGBLEDColor(float red, float green, float blue, float brightness) {
  if (USE_BUILTIN_RGB_LED) {
    pinMode(LEDR, OUTPUT);
    analogWrite(LEDR, brightness * 255 * (1.0f - red));  // Cathode tied to +3V3
    pinMode(LEDG, OUTPUT);
    analogWrite(LEDG, brightness * 255 * (1.0f - green));
    pinMode(LEDB, OUTPUT);
    analogWrite(LEDB, brightness * 255 * (1.0f - blue));
  }

  if (USE_NEOPIXEL) {
    for (int i = 0; i < strip.numPixels(); i++) {
      // Set pixel's color (in memory)
      strip.setPixelColor(i, strip.Color(255 * red, 255 * green, 255 * blue));
    }
    strip.setBrightness(NEO_BRIGHTNESS_MAX * brightness);
    strip.show();  // send update to strip
  }
}

const uint8_t PROGMEM gamma8[] = {
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1,   1,
    1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   2,   2,   2,
    2,   2,   2,   2,   3,   3,   3,   3,   3,   3,   3,   4,   4,   4,   4,
    4,   5,   5,   5,   5,   6,   6,   6,   6,   7,   7,   7,   7,   8,   8,
    8,   9,   9,   9,   10,  10,  10,  11,  11,  11,  12,  12,  13,  13,  13,
    14,  14,  15,  15,  16,  16,  17,  17,  18,  18,  19,  19,  20,  20,  21,
    21,  22,  22,  23,  24,  24,  25,  25,  26,  27,  27,  28,  29,  29,  30,
    31,  32,  32,  33,  34,  35,  35,  36,  37,  38,  39,  39,  40,  41,  42,
    43,  44,  45,  46,  47,  48,  49,  50,  50,  51,  52,  54,  55,  56,  57,
    58,  59,  60,  61,  62,  63,  64,  66,  67,  68,  69,  70,  72,  73,  74,
    75,  77,  78,  79,  81,  82,  83,  85,  86,  87,  89,  90,  92,  93,  95,
    96,  98,  99,  101, 102, 104, 105, 107, 109, 110, 112, 114, 115, 117, 119,
    120, 122, 124, 126, 127, 129, 131, 133, 135, 137, 138, 140, 142, 144, 146,
    148, 150, 152, 154, 156, 158, 160, 162, 164, 167, 169, 171, 173, 175, 177,
    180, 182, 184, 186, 189, 191, 193, 196, 198, 200, 203, 205, 208, 210, 213,
    215, 218, 220, 223, 225, 228, 231, 233, 236, 239, 241, 244, 247, 249, 252,
    255};

#if BLE_BROADCAST
#include "ble_broadcast.h"
#else
#include "ble_peripheral.h"
#endif

void setup() {
#if LOGGING
  Serial.begin(115200);
  while (!Serial)
    ;
#endif

  // set LED pin to output mode
  // pinMode(ledPin, OUTPUT);

  // digitalWrite(ledPin, HIGH);  // will turn the LED on
  // delay(500);
  // digitalWrite(ledPin, LOW);  // will turn the LED off

  deviceIndex = frand() * 128;

  setRGBLEDEnabled(true);

  // begin initialization
  if (!BLE.begin()) {
#if LOGGING
    Serial.println("starting BLE failed!");
#endif

    while (1)
      ;
  }

  bleSetup();

  // init music code
  startTime = millis();
}

#define GAMMA_CORR(x) pgm_read_byte(&gamma8[x])

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
    long currentOffset = (now + serverTimeDelta) - (startTime);
    int period = getBeatPeriod(bpm);
    if (program == PGM_ALTERNATE) {
      // in alternate mode, only pulse for 1/4 beats, determined by device index
      currentOffset += (deviceIndex % 4) * period;
      period = getBeatPeriod(bpm / 4);
    }
    float intensity = getIntensity(currentOffset, period) * (energy / 1000.0f);

#if LOGGING
    // Serial.printf("intensity: %f\n", intensity);
#endif

    switch (program) {
      case PGM_RAINBOW:
        rainbowCycle(currentOffset, getBeatPeriod(bpm / 4));
        break;
      case PGM_GRADIENT:
        gradientColor(currentOffset, getBeatPeriod(bpm / 4), intensity);
        break;
      default:
        setRGBLEDColor(GAMMA_CORR((int)(gradients[gradient].from.r)) / 255.0f,
                       GAMMA_CORR((int)(gradients[gradient].from.g)) / 255.0f,
                       GAMMA_CORR((int)(gradients[gradient].from.b)) / 255.0f,
                       intensity);
    }
    // delay(16);
    ledLastUpdate = now;
  }

  bleLoop();
}

float lerp(float v0, float v1, float t) {
  return v0 + t * (v1 - v0);
}

// Rainbow cycle along whole strip. Pass delay time (in ms) between frames.
void rainbowCycle(long currentOffset, long period) {
  // Color wheel has a range of 65536
  long firstPixelHue = ((currentOffset % period) / (float)period) * 65536;
  for (int i = 0; i < strip.numPixels(); i++) {  // For each pixel in strip...
    // Offset pixel hue by an amount to make one full revolution of the
    // color wheel (range of 65536) along the length of the strip
    // (strip.numPixels() steps):
    int pixelHue = firstPixelHue + (i * 65536L / strip.numPixels());
    // strip.ColorHSV() can take 1 or 3 arguments: a hue (0 to 65535) or
    // optionally add saturation and value (brightness) (each 0 to 255).
    // Here we're using just the single-argument hue variant. The result
    // is passed through strip.gamma32() to provide 'truer' colors
    // before assigning to each pixel:
    strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue)));
  }
  strip.setBrightness(50);
  strip.show();  // Update strip with new contents
}

void gradientColor(long currentOffset, long period, float intensity) {
  float t = ((currentOffset % period) / (float)period);
  float tCycled = (t > 0.5 ? 1.0 - t : t) * 2.0;

  int red = lerp(gradients[gradient].from.r / 255.0,
                 gradients[gradient].to.r / 255.0, tCycled) *
            255;
  int green = lerp(gradients[gradient].from.g / 255.0,
                   gradients[gradient].to.g / 255.0, tCycled) *
              255;
  int blue = lerp(gradients[gradient].from.b / 255.0,
                  gradients[gradient].to.b / 255.0, tCycled) *
             255;

  setRGBLEDColor(GAMMA_CORR(red), GAMMA_CORR(green), GAMMA_CORR(blue),
                 intensity);
}
