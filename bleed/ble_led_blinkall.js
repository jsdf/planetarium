var noble = require('@abandonware/noble');
var Characteristic = require('@abandonware/noble/lib/characteristic');

function compareUUIDs(a, b) {
  a = a || '';
  b = b || '';
  a = a.toLowerCase().replace(/\-/g, '');
  b = b.toLowerCase().replace(/\-/g, '');
  return a === b;
}

let ledState = true;

let logging = true;

const devices = new Map();
const characteristicsMap = {};

async function forceDisconnect(peripheral) {
  if (characteristicsMap[peripheral.uuid]) {
    await characteristicsMap[peripheral.uuid].disconnect.writeAsync(
      Buffer.from([1]),
      true
    );
  } else {
    console.log(peripheral.uuid, 'not in map');
  }
}

async function traverse(peripheral) {
  // Once the peripheral has been discovered, then connect to it.
  // It can also be constructed if the uuid is already known.
  ///
  await peripheral.connectAsync();
  console.log(
    'connected to ',
    peripheral.id,
    peripheral.advertisement.localName
  );

  characteristicsMap[peripheral.uuid] = {};

  // Once the peripheral has been connected, then discover the
  // services and characteristics of interest.
  const services = await peripheral.discoverServicesAsync(['beef']);

  const characteristics = await services[0].discoverCharacteristicsAsync([
    'feed',
    'b00f',
  ]);

  characteristics.forEach((characteristic) => {
    switch (characteristic.uuid) {
      case 'feed':
        characteristicsMap[peripheral.uuid].updateLED = characteristic;
        return;
      case 'b00f':
        characteristicsMap[peripheral.uuid].disconnect = characteristic;
        return;
    }
  });
}

async function updateLEDs() {
  ledState = !ledState;

  logging &&
    console.log(new Date(), 'setting led', ledState ? 'on' : 'off', 'for', [
      ...devices.keys(),
    ]);

  await Promise.allSettled(
    [...devices.values()].map(async (peripheral) => {
      if (!characteristicsMap[peripheral.uuid]) {
        console.error(peripheral.uuid, 'not in map');
        return;
      }
      await characteristicsMap[peripheral.uuid].updateLED.writeAsync(
        Buffer.from([ledState ? 1 : 0]),
        true
      );
      logging && console.log(peripheral.uuid, 'done updating led');
    })
  );
}

function updateLoop() {
  setTimeout(() => {
    updateLEDs()
      .then(() => updateLoop())
      .catch((err) => {
        console.error('updateLoop error', err);
      });
  }, 10000);
}

noble.on('discover', (peripheral) => {
  console.log(
    new Date(),
    peripheral.id,
    peripheral.advertisement.localName || '[no name]',
    peripheral.rssi
    // peripheral
  );

  // if (
  //   !(
  //     peripheral.advertisement.localName &&
  //     peripheral.advertisement.localName.includes('LED')
  //   )
  // )
  //   return;

  if (!devices.has(peripheral.uuid)) {
    devices.set(peripheral.uuid, peripheral);
    traverse(peripheral).catch((err) => {
      console.error('traverse error', err);
    });
    // updateLED(peripheral);
    peripheral.on('disconnect', () => {
      console.log(peripheral.id, 'disconnected');
    });
  }
});

console.log('start scanning');
noble.startScanning(['beef'], /*allowDuplicates*/ false);

updateLoop();
