const bleno = require('@abandonware/bleno');
const os = require('os');
const performanceNow = require('performance-now');

// var name = 'dick';
var name = 'd';
var serviceUuid = 'f0000000000000000000000000000000';
var currentDataPacket = Buffer.alloc(16);

function getAdvertisedUUIDs() {
  if (os.platform() == 'darwin') {
    return [serviceUuid, 'b0ef'];
  } else {
    return ['b0ef', serviceUuid];
  }
}

let poweredOn = false;
let advertising = false;

function setUUID(packet) {
  const uuid = packet.toString('hex');
  if (uuid.length != 32) {
    throw new Error(`invalid uuid length: ${uuid.length} (${uuid})`);
  }
  serviceUuid = uuid;
  currentDataPacket = packet;

  restartAdvertising().catch((err) => {
    console.log('setUUID', uuid, 'error', err);
  });
}

function blenoStopAdvertisingAsync() {
  return new Promise((resolve, reject) => {
    bleno.stopAdvertising((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function restartAdvertising() {
  try {
    await blenoStopAdvertisingAsync();
    advertising = false;
  } catch (err) {
    console.error(err);
    setTimeout(() => restartAdvertising(), 1000);
  }
  await startAdvertising();
}

function blenoStartAdvertisingAsync(name, services) {
  return new Promise((resolve, reject) => {
    bleno.startAdvertising(name, services, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function startAdvertising() {
  await blenoStartAdvertisingAsync(name, getAdvertisedUUIDs());
  advertising = true;

  console.log('startAdvertising', getAdvertisedUUIDs());
}

function init() {
  bleno.on('stateChange', (state) => {
    console.log('stateChange', state);
    if (state == 'poweredOn') {
      if (!poweredOn) {
        poweredOn = true;
        startAdvertising().catch((err) => {
          console.error('startAdvertising error:', err, getAdvertisedUUIDs());
        });
      }
    }
  });
}

let servicesImpl = null;
function setServicesImpl(impl) {
  servicesImpl = impl;
}

var syncTimeCharacteristic = new bleno.Characteristic({
  uuid: 'feab', // or 'fff1' for 16-bit
  properties: ['read'], // can be a combination of 'read', 'write', 'writeWithoutResponse', 'notify', 'indicate'

  onReadRequest: function (offset, callback) {
    if (!servicesImpl) {
      throw new Error('servicesImpl not injected yet');
    }
    var result = bleno.Characteristic.RESULT_SUCCESS;
    var data = Buffer.alloc(4);
    data.writeUInt32LE(servicesImpl.getServerTime());
    console.log(syncTimeCharacteristic, {result, data});
    callback(result, data);
  },
});
var readDataCharacteristic = new bleno.Characteristic({
  uuid: 'feed', // or 'fff1' for 16-bit
  properties: ['read'], // can be a combination of 'read', 'write', 'writeWithoutResponse', 'notify', 'indicate'

  onReadRequest: function (offset, callback) {
    if (!servicesImpl) {
      throw new Error('servicesImpl not injected yet');
    }
    var result = bleno.Characteristic.RESULT_SUCCESS;
    console.log('readDataCharacteristic');

    callback(result, currentDataPacket);
  },
});
bleno.on('accept', (clientAddress) => {
  console.log('accept', clientAddress);
});
bleno.on('disconnect', (clientAddress) => {
  console.log('disconnect', clientAddress);
});

var primaryService = new bleno.PrimaryService({
  uuid: 'b0ef', // or 'fff0' for 16-bit
  characteristics: [syncTimeCharacteristic, readDataCharacteristic],
});

bleno.setServices([primaryService]);

function advertiseTestLoop() {
  setTimeout(() => {
    // gen random uuid
    const newUUIDChars = [];
    for (var i = 0; i < serviceUuid.length; i++) {
      newUUIDChars[i] = Math.floor(Math.random() * 16).toString(16);
    }
    const newUUID = newUUIDChars.join('');
    console.log('set new uuid', newUUID);
    setUUID(newUUID);

    advertiseTestLoop();
  }, 1000);
}

if (require.main === module) {
  init();
  advertiseTestLoop();
}

setServicesImpl({
  getServerTime() {
    return performanceNow();
  },
});

module.exports = {init, setUUID, setServicesImpl};
