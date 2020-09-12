

unsigned long startBLE;

bool hasDiscoveredServices = false;
BLEDevice deviceWithServices;

bool hasCachedDevice = false;
BLEDevice cachedDevice;

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

bool parseCharacteristicPacket(uint8_t packet[16]) {
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
  return updatedValues;
}

bool discoverServices(BLEDevice& peripheral) {
#if LOGGING
  Serial.printf("discoverServices Connecting to %s\n",
                peripheral.address().c_str());
#endif
  if (!peripheral.connect()) {
#if LOGGING
    Serial.println("Failed to connect!");
#endif
    return false;
  }

#if LOGGING
  Serial.println("Connected");
#endif

#if LOGGING
  Serial.printf("Discovering service attributes ... existing:%d\n",
                peripheral.serviceCount());
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
    return false;
  }
  deviceWithServices = peripheral;
  hasDiscoveredServices = true;

  for (int i = 0; i < deviceWithServices.serviceCount(); ++i) {
#if LOGGING
    BLEService service = deviceWithServices.service(i);
    Serial.printf("service %d %s \n", i, service.uuid());
    for (int k = 0; k < service.characteristicCount(); ++k) {
      BLECharacteristic characteristic = service.characteristic(k);
      Serial.printf("characteristic %d %s \n", k, characteristic.uuid());
    }
#endif
  }
  peripheral.disconnect();
  return true;
}

bool syncData(BLEDevice& peripheral) {
  BLEService primaryService = peripheral.service("b0ef");
  // try to use readDataCharacteristic
  BLECharacteristic readDataCharacteristic =
      primaryService.characteristic("feed");
  if (!readDataCharacteristic) {
#if LOGGING
    Serial.println("Peripheral does NOT have readDataCharacteristic");
#endif
    // peripheral.disconnect();
    return false;
  }

  uint8_t packet[16];
  // const uint8_t* packetConst = ledCharacteristic.value();
  // memcpy(packet, packetConst, 16);

  int readValueResult = readDataCharacteristic.readValue(packet, 16);
#if LOGGING
  Serial.printf("readDataCharacteristic.readValue:%d\n", readValueResult);
#endif
  bool updatedData = parseCharacteristicPacket(packet);

#if LOGGING
  Serial.printf("updatedData:%d\n", updatedData);
#endif

  // peripheral.disconnect();
  return updatedData;
}

bool parsePacket(String packet) {
  long newStartTimeUnsigned =
      strtoul(packet.substring(hexByte(0), hexByte(4)).c_str(), NULL, 16);

  long newStartTime = 0;
  memcpy(&newStartTime, &newStartTimeUnsigned, 4);

  unsigned char newBPM =
      strtoul(packet.substring(hexByte(4), hexByte(5)).c_str(), NULL, 16);

  unsigned char newGradient =
      strtoul(packet.substring(hexByte(5), hexByte(6)).c_str(), NULL, 16);
  int newEnergy =
      ((strtoul(packet.substring(hexByte(6), hexByte(7)).c_str(), NULL, 16) /
        255.0) *
       1000);
  int newAttack =
      ((strtoul(packet.substring(hexByte(7), hexByte(8)).c_str(), NULL, 16) /
        255.0) *
       600);
  int newRelease =
      ((strtoul(packet.substring(hexByte(8), hexByte(9)).c_str(), NULL, 16) /
        255.0) *
       600);
  unsigned char newProgram =
      strtoul(packet.substring(hexByte(9), hexByte(10)).c_str(), NULL, 16);

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
    Serial.printf("parsed: %s\n", packet.c_str());
    Serial.printf("bpm:%u startTime:%d took:%lu\n", newBPM, newStartTime,
                  endBLE - startBLE);
  }
#endif
  return updatedValues;
}

void handleDiscoverEvent(BLEDevice device) {
  hasCachedDevice = true;
#if LOGGING
  Serial.printf("device: %s packet: %s\n", device.address().c_str(),
                device.advertisedServiceUuid(1).c_str());
#endif
  cachedDevice = device;
}

// rpi4
uint8_t addressFilter[6] = {0xdc, 0xa6, 0x32, 0xbd, 0x7e, 0x61};

void bleSetup() {
#if LOGGING
  Serial.println("BLE Central scan");
#endif

  // BLE.setEventHandler(BLEDiscovered, handleDiscoverEvent);
  GAP.setAddressFilter(addressFilter);

  // start scanning for peripheral
  // BLE.scan();
  BLE.scanForUuid("b0ef", true);
  // BLE.scanForUuid("B0EF", true);
}

void syncTime(BLEDevice& peripheral) {
#if LOGGING
  Serial.printf("discoverServices Connecting to %s\n",
                peripheral.address().c_str());
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
  Serial.printf("Discovering service attributes ... existing:%d\n",
                peripheral.serviceCount());
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
  if (!syncTimeCharacterisic) {
#if LOGGING
    Serial.println("Peripheral does NOT have syncTimeCharacterisic");
#endif
    // peripheral.disconnect();
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

String lastpacket;
unsigned long lastDataUpdateTime = 0;

void bleLoop() {
  startBLE = millis();
  unsigned long now = millis();
  BLEDevice peripheral = BLE.available();
  // if (!peripheral && hasCachedDevice) {
  //   peripheral = cachedDevice;
  // }
  bool isBleedBroadcast = false;
  String thePacket;

  if (peripheral) {
#if LOGGING
    Serial.print("peripheral:");
    Serial.print(peripheral.address());
    Serial.println();
#endif
    if (peripheral.hasAdvertisedServiceUuid()) {
      for (int i = 0; i < (int)peripheral.advertisedServiceUuidCount(); i++) {
        if (peripheral.advertisedServiceUuid(i) == "b0ef") {
          isBleedBroadcast = true;
        } else {
          thePacket = peripheral.advertisedServiceUuid(i);
        }
      }

      if (isBleedBroadcast && !hasServerTimeDelta) {
        BLE.stopScan();

        syncTime(peripheral);
        if (peripheral.connected()) {
          peripheral.disconnect();
        }

        BLE.scanForUuid("b0ef", true);
      }
    }

    if (isBleedBroadcast) {
#if LOGGING
      Serial.println("isBleedBroadcast");
#endif
      if (thePacket == lastpacket) {
#if LOGGING
        // Serial.println("packet unchanged");
#endif
      } else {
        lastpacket = thePacket;
        String advertismentPacket = undashUUID(thePacket);

        bool updatedValues = parsePacket(advertismentPacket);

        if (updatedValues) {
          // dumb shit to make the BLE layer find any new advertisements asap
          // BLE.stopScan();
          // BLE.scanForUuid("b0ef", true);
        }
      }
    }
  }
}
