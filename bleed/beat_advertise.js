const bleno = require('@abandonware/bleno');

// var name = 'dick';
var name = null;
var serviceUuid = 'feedbeeffffffffffffffffffffffff0';

function getAdvertisedUUIDs() {
  return ['b0ef', serviceUuid];
}

let poweredOn = false;
let advertising = false;

function restart() {
  advertising = false;
  bleno.stopAdvertising(() => {
    const newUUID = [];
    for (var i = 0; i < serviceUuid.length; i++) {
      newUUID[i] = Math.floor(Math.random() * 16).toString(16);
    }
    serviceUuid = newUUID.join('');
    start();
  });
}

function start() {
  advertising = true;
  bleno.startAdvertising(name, getAdvertisedUUIDs(), (err) => {
    if (err) {
      console.error('startAdvertising error:', err, getAdvertisedUUIDs());
    } else {
      console.log('startAdvertising', getAdvertisedUUIDs());
    }
  });
}

function advertiseLoop() {
  setTimeout(() => {
    restart();
    advertiseLoop();
  }, 1000);
}

bleno.on('stateChange', (state) => {
  console.log('stateChange', state);
  if (state == 'poweredOn') {
    if (!poweredOn) {
      poweredOn = true;
      start();
      advertiseLoop();
    }
  }
});
