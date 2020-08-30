const bleno = require('@abandonware/bleno');

var name = 'dick';
var serviceUuids = [
  'fffffffffffffffffffffffffffffff0',
  'fffffffffffffffffffffffffffffffd',
];

function start() {
  bleno.startAdvertising(name, serviceUuids, (err) => {
    console.error('startAdvertising error:', err);
  });
}

let poweredOn = false;
bleno.on('stateChange', (state) => {
  console.log('stateChange', state);
  if (state == 'poweredOn') {
    if (!poweredOn) {
      poweredOn = true;
      start();
    }
  }
});
