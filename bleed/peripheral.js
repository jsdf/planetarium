var bleno = require('@abandonware/bleno');

var name = 'bleed';
var ledServiceUUID = 'ffe0'; // simple key service
var serviceUuids = [ledServiceUUID];

var BlenoPrimaryService = bleno.PrimaryService;

var util = require('util');

var bleno = require('../..');

var BlenoCharacteristic = bleno.Characteristic;

class LEDCharacteristic extends BlenoCharacteristic {
  constructor() {
    super({
      uuid: 'ffe1', // simple key characteristic
      properties: ['read', 'write', 'notify'],
      value: null,
    });

    this._value = new Buffer(0);
    this._updateValueCallback = null;
  }

  onReadRequest(offset, callback) {
    console.log(
      'LEDCharacteristic - onReadRequest: value = ' +
        this._value.toString('hex')
    );

    callback(this.RESULT_SUCCESS, this._value);
  }
  onWriteRequest(data, offset, withoutResponse, callback) {
    this._value = data;

    console.log(
      'LEDCharacteristic - onWriteRequest: value = ' +
        this._value.toString('hex')
    );

    if (this._updateValueCallback) {
      console.log('LEDCharacteristic - onWriteRequest: notifying');

      this._updateValueCallback(this._value);
    }

    callback(this.RESULT_SUCCESS);
  }
  onSubscribe(maxValueSize, updateValueCallback) {
    console.log('LEDCharacteristic - onSubscribe');

    this._updateValueCallback = updateValueCallback;
  }
  onUnsubscribe() {
    console.log('LEDCharacteristic - onUnsubscribe');

    this._updateValueCallback = null;
  }
}

console.log('bleno - led');

bleno.on('stateChange', function (state) {
  console.log('on -> stateChange: ' + state);

  if (state === 'poweredOn') {
    bleno.startAdvertising(name, serviceUuids);
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('advertisingStart', function (error) {
  console.log(
    'on -> advertisingStart: ' + (error ? 'error ' + error : 'success')
  );

  if (!error) {
    bleno.setServices([
      new BlenoPrimaryService({
        uuid: ledServiceUUID,
        characteristics: [new LEDCharacteristic()],
      }),
    ]);
  }
});
