
BLEService ledService("b33d");  // create service

BLECharacteristic ledCharacteristic("b00d", BLERead | BLEWrite, 0, 16);

void bleSetup() {
  // set the local name peripheral advertises
  BLE.setLocalName("bl");
  // set the UUID for the service this peripheral advertises:
  BLE.setAdvertisedService(ledService);

  // add the characteristics to the service
  ledService.addCharacteristic(ledCharacteristic);

  // add the service
  BLE.addService(ledService);

  char empty[16];
  for (int i = 0; i < 16; ++i) {
    empty[i] = 0;
  }
  const char* emptyPtr = empty;

  ledCharacteristic.writeValue(emptyPtr);

  // start advertising
  BLE.advertise();

#if LOGGING
  Serial.println("Bluetooth device active, waiting for connections...");
#endif
}

void bleLoop() {
  // poll for BLE events
  BLE.poll();

  if (ledCharacteristic.written()) {
    uint8_t packet[16];
    const uint8_t* packetConst = ledCharacteristic.value();
    memcpy(packet, packetConst, 16);

    int newStartTime = *(const int*)packet;
    uint8_t newBPM = *(packet + 4);

    uint8_t newGradient = *(packet + 5);
    int newEnergy = ((*(packet + 6) / 255.0) * 1000);
    int newAttack = ((*(packet + 7) / 255.0) * 600);
    int newRelease = ((*(packet + 8) / 255.0) * 600);
    uint8_t newProgram = *(packet + 7);

    unsigned long endBLE = millis();

    bool updatedValues = false;
    if (newBPM > 10 && newBPM < 255 && bpm != newBPM) {
      bpm = newBPM;
      updatedValues = true;
    }
    if (startTime != newStartTime) {
      startTime = newStartTime;
      updatedValues = true;
    }
    if (gradient != newGradient) {
      gradient = newGradient;
      updatedValues = true;
    }
    if (energy != newEnergy) {
      energy = newEnergy;
      updatedValues = true;
    }
    if (attack != newAttack) {
      attack = newAttack;
      updatedValues = true;
    }
    if (release != newRelease) {
      release = newRelease;
      updatedValues = true;
    }
    if (program != newProgram) {
      program = newProgram;
      updatedValues = true;
    }

#if LOGGING
    if (updatedValues) {
      // Serial.printf("parsed: from: %service\n",
      // peripheral.address().c_str());
      Serial.printf("bpm:%u startTime:%d \n", newBPM, newStartTime);
    }
#endif
  }
}
