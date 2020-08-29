var noble = require('@abandonware/noble');
var Characteristic = require('@abandonware/noble/lib/characteristic');

function compareUUIDs(a, b) {
  a = a || '';
  b = b || '';
  a = a.toLowerCase().replace(/\-/g, '');
  b = b.toLowerCase().replace(/\-/g, '');
  return a === b;
}

const connectedDevices = new Map();
const leds = new Map();

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('shutting down');
  Promise.allSettled(
    [...connectedDevices.values()].map((peripheral) => {
      console.log('disconnected from ', peripheral.uuid);
      return peripheral.disconnectAsync().catch((err) => {
        console.error(err);
      });
    })
  ).then(() => {
    process.exit(0);
  });
}

function asyncLoop() {
  setTimeout(() => {
    if (shuttingDown) return;

    Promise.allSettled(
      [...connectedDevices.values()].map((peripheral) => {
        return new Promise((resolve, reject) => {
          console.log('trying to update', peripheral.uuid, peripheral.state);

          // if (!peripheral.connectable) {
          //   console.log(('cannot connect, current state', peripheral.state));
          //   return;
          // }

          function onConnect() {
            const ledState = leds.get(peripheral.uuid);
            if (!ledState) {
              return reject(`no led for ${peripheral.uuid}`);
            }

            console.log('toggling', peripheral.uuid);

            toggleLed(ledState, peripheral)
              .then(() => {
                console.log('disonnecting from ', peripheral.uuid);
                return peripheral.disconnectAsync();
              })
              .then(resolve)
              .catch(reject);
          }
          switch (peripheral.state) {
            case 'connected':
              return onConnect();
            case 'connecting':
              return peripheral.once('connect', onConnect);
            default:
              peripheral.connect(function (err) {
                console.log(
                  'connected to ',
                  peripheral.id,
                  peripheral.advertisement.localName,
                  err
                );
                onConnect();
              });
              return;
          }
        });
      })
    ).then((results) => {
      console.log(results);
      asyncLoop();
    });
  }, 5000);
}
// asyncLoop();

async function toggleLed(ledState, peripheral) {
  console.log('gonna read', ledState.uuid);
  // const ledState = new Characteristic(
  //   noble,
  //   peripheral.uuid,
  //   'beef',
  //   'feed',
  //   ledState.properties.slice()
  // );
  const data = await ledState.readAsync();

  const newState = Buffer.from([data[0] ^ 1]);
  console.log('setting state to ', newState);
  await ledState.writeAsync(newState, true);
  console.log('done');
}

noble.on('discover', (peripheral) => {
  console.log(
    new Date(),
    peripheral.id,
    peripheral.advertisement.localName || '[no name]',
    peripheral.rssi
    // peripheral
  );

  if (
    !(
      peripheral.advertisement.localName &&
      peripheral.advertisement.localName.includes('LED')
    )
  )
    return;
  // found, stop scanning
  // noble.stopScanning();

  connectedDevices.set(peripheral.uuid, peripheral);

  // console.log(peripheral.advertisement.localName, peripheral);
  // return;

  //
  // Once the peripheral has been discovered, then connect to it.
  // It can also be constructed if the uuid is already known.
  ///
  peripheral.connect(function (err) {
    console.log(
      'connected to ',
      peripheral.id,
      peripheral.advertisement.localName,
      err
    );

    //
    // Once the peripheral has been connected, then discover the
    // services and characteristics of interest.
    //
    peripheral.discoverServices(['beef'], function (err, services) {
      console.log('discoverServices', err /*services*/);
      services.forEach(function (service) {
        console.log('found service', /*service*/ service.uuid, service.name);

        //
        // So, discover its characteristics.
        //
        service.discoverCharacteristics(['feed'], function (
          err,
          characteristics
        ) {
          console.log(
            'found characteristics',
            err || characteristics.map((c) => c.uuid)
          );
          characteristics.forEach(function (characteristic) {
            //
            // Loop through each characteristic and match them to the
            // UUIDs that we know about.
            //
            console.log('found characteristic:', characteristic.uuid);
            toggleLed(characteristic, peripheral);
            // console.log('storing ', characteristic.toString());
            // leds.set(peripheral.uuid, characteristic);
            // characteristic.setMaxListeners(20);
            // peripheral.disconnect();
          });
        });
      });
    });
  });

  // catch ctrl+c event and exit normally
  process.on('SIGINT', function () {
    shutdown();
  });
});

noble.startScanning(['beef'], true); // any service UUID, allow duplicates
