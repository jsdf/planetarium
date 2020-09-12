// Read the battery level of the first found peripheral exposing the Battery Level characteristic

const noble = require('@abandonware/noble');
const {default: PQueue} = require('p-queue');

const queue = new PQueue({concurrency: 5});
const peripherals = new Map();

function init() {
  noble.on('stateChange', async (state) => {
    if (state === 'poweredOn') {
      await noble.startScanningAsync(['b33d'], false);
    }
  });

  noble.on('discover', async (peripheral) => {
    await noble.stopScanningAsync();
    await peripheral.connectAsync();
    const {
      characteristics,
    } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
      ['b33d'],
      ['b00d']
    );
    const ledCharacteristic = characteristics[0];

    console.log(
      `${peripheral.address} (${peripheral.advertisement.localName}): ledCharacteristic found%`
    );

    await peripheral.disconnectAsync();

    peripherals.set(peripheral.id, {
      peripheral,
      ledCharacteristic,
    });
  });
}

let updateInProgress = null;
let latestUpdateId = 0;
let latestPacket = null;
async function sendPacket(packet) {
  latestPacket = packet;
  const updateId = ++latestUpdateId;
  // wait for current to be cancelled
  if (updateInProgress) {
    await updateInProgress;
  }
  // start new update
  updateInProgress = doSend(updateId, latestPacket);
  await updateInProgress;
  // reset
  updateInProgress = null;
}

async function doSend(updateId, packet) {
  for (const peripheralDef of peripherals.values()) {
    queue.add(updateOne(peripheralDef, packet, updateId));
  }
}

function timeoutReject(name, time) {
  return new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error(`timed out: $${name}`)), time)
  );
}

async function updateOne({peripheral, ledCharacteristic}, packet, updateId) {
  // outdated, give up on this packet
  if (updateId != latestUpdateId) {
    return;
  }
  const failureTimeout = timeoutReject(peripheral.uuid, 1000);
  try {
    await Promise.race([failureTimeout, peripheral.connectAsync()]);
    await Promise.race([failureTimeout, ledCharacteristic.writeAsync(packet)]);
    await Promise.race([failureTimeout, disconnectAsync()]);
  } catch (err) {
    console.error(peripheral.uuid, 'error', err);

    peripheral.disconnectAsync().catch((err2) => {
      //ignore
    });
  }
}

function setServicesImpl() {}

module.exports = {init, sendPacket, setServicesImpl};
