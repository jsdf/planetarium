var noble = require('@abandonware/noble');

function compareUUIDs(a, b) {
  a = a || '';
  b = b || '';
  a = a.toLowerCase().replace(/\-/g, '');
  b = b.toLowerCase().replace(/\-/g, '');
  return a === b;
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
    peripheral.discoverServices([], function (err, services) {
      console.log('discoverServices', err /*services*/);
      services.forEach(function (service) {
        console.log('found service', /*service*/ service.uuid, service.name);

        //
        // So, discover its characteristics.
        //
        service.discoverCharacteristics([], function (err, characteristics) {
          console.log('found characteristics', err /*characteristics*/);
          characteristics.forEach(function (characteristic) {
            //
            // Loop through each characteristic and match them to the
            // UUIDs that we know about.
            //
            console.log('found characteristic:', characteristic.uuid);
          });
        });
      });
    });
  });

  // catch ctrl+c event and exit normally
  process.on('SIGINT', function () {
    console.log('shutting down');
    peripheral.disconnectAsync().then(() => {
      console.log('now exiting');
      process.exit(0);
    });
  });
});

noble.startScanning([], true); // any service UUID, allow duplicates
