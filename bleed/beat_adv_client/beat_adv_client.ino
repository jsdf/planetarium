

#include <ArduinoBLE.h>

const int ledPin = LED_BUILTIN;  // pin to use for the LED

#define LOGGING 1

void setup() {
#if LOGGING
  Serial.begin(9600);
  while (!Serial)
    ;
#endif

  // set LED pin to output mode
  pinMode(ledPin, OUTPUT);

  digitalWrite(ledPin, HIGH);  // will turn the LED on
  delay(500);
  digitalWrite(ledPin, LOW);  // will turn the LED off

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
}

void loop() {
  unsigned long start = millis();
  BLEDevice peripheral = BLE.available();

  if (peripheral) {
    // print the advertised service UUIDs, if present
    if (peripheral.hasAdvertisedServiceUuid()) {
#if LOGGING
      if (peripheral.advertisedServiceUuid(0) == "b0ef") {
        // Serial.print("addr: ");
        // Serial.print(peripheral.address());
        // Serial.println();
        // Serial.print("Service UUIDs: ");
        for (int i = 0; i < peripheral.advertisedServiceUuidCount(); i++) {
          // Serial.print(peripheral.advertisedServiceUuid(i));
          // Serial.print(" ");
        }
        // Serial.println();
        unsigned long end = millis();

        Serial.print("took: ");
        Serial.print(end - start, DEC);
        Serial.println();
      }
#endif
    }
  }
}

//