const bleno = require('@abandonware/bleno');
const os = require('os');

// var name = 'dick';
var name = 'd';
var serviceUuid = 'f0000000000000000000000000000000';

function getAdvertisedUUIDs() {
  if (os.platform() == 'darwin') {
    return [serviceUuid, 'b0ef'];
  } else {
    return ['b0ef', serviceUuid];
  }
}

let poweredOn = false;
let advertising = false;

function setUUID(uuid) {
  if (uuid.length != 32) {
    throw new Error(`invalid uuid length: ${uuid.length} (${uuid})`);
  }
  serviceUuid = uuid;

  if (advertising) {
    restartAdvertising();
  }
}

function restartAdvertising() {
  advertising = false;
  if (os.platform() == 'darwin') {
    bleno.stopAdvertising(() => {});
    setTimeout(() => {
      startAdvertising(() => {
        console.log('now advertising', getAdvertisedUUIDs());
      });
    }, 0);
  } else {
    bleno.stopAdvertising(() => {
      startAdvertising(() => {
        console.log('now advertising', getAdvertisedUUIDs());
      });
    });
  }
}

function startAdvertising() {
  advertising = true;
  bleno.startAdvertising(name, getAdvertisedUUIDs(), (err) => {
    if (err) {
      console.error('startAdvertising error:', err, getAdvertisedUUIDs());
    } else {
      console.log('startAdvertising', getAdvertisedUUIDs());
    }
  });
}

function init() {
  bleno.on('stateChange', (state) => {
    console.log('stateChange', state);
    if (state == 'poweredOn') {
      if (!poweredOn) {
        poweredOn = true;
        startAdvertising();
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
    // console.log({result, data})
    callback(result, data);
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
  characteristics: [syncTimeCharacteristic],
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

module.exports = {init, setUUID, setServicesImpl};
