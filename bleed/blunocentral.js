var noble = require('@abandonware/noble');

function compareUUIDs(a, b) {
  a = a || '';
  b = b || '';
  a = a.toLowerCase().replace(/\-/g, '');
  b = b.toLowerCase().replace(/\-/g, '');
  return a === b;
}

noble.on('discover', (peripheral) => {
  if (
    !(
      peripheral.advertisement.localName &&
      peripheral.advertisement.localName.includes('Bluno')
    )
  )
    return;
  console.log(
    new Date(),
    peripheral.id,
    peripheral.advertisement.localName
    // peripheral
  );

  const self = {};

  //
  // Once the peripheral has been discovered, then connect to it.
  // It can also be constructed if the uuid is already known.
  ///
  peripheral.connect(function (err) {
    console.log('connected', err);

    //
    // Once the peripheral has been connected, then discover the
    // services and characteristics of interest.
    //
    peripheral.discoverServices(['dfb0'], function (err, services) {
      console.log('discoverServices', err /*services*/);
      services.forEach(function (service) {
        console.log('found service', /*service*/ service.uuid, service.name);

        //
        // So, discover its characteristics.
        //
        service.discoverCharacteristics(['dfb1'], function (
          err,
          characteristics
        ) {
          console.log('found characteristics', err /*characteristics*/);
          characteristics.forEach(function (characteristic) {
            //
            // Loop through each characteristic and match them to the
            // UUIDs that we know about.
            //
            console.log('found characteristic:', characteristic.uuid);

            if (compareUUIDs(characteristic.uuid, 'dfb1')) {
              self.serial = characteristic;
            }
          });

          //
          // Check to see if we found all of our characteristics.
          //
          if (self.serial) {
            console.log('reading serial');

            function readLoop() {
              setTimeout(() => {
                self.serial.read((error, data) => {
                  if (error) console.error(error);
                  else console.log(data.toString('utf8'));
                  readLoop();
                });
              }, 1000);
            }
            readLoop();

            // self.serial.on('read', function (data, isNotification) {
            //   console.log('read', data, isNotification);
            //   // self.emit('data', data);
            // });
            self.serial.on('data', function (data, isNotification) {
              console.log('data', data.toString('utf8'), {isNotification});
            });
            self.serial.notify(true, function (err) {
              console.log('notify', err);
            });
            self.serial.subscribe(function (err) {
              console.log('subscribe', err);
            });

            let str = 'hello';
            let pos = 0;
            function writeLoop() {
              setTimeout(() => {
                console.log('write ', str[pos]);
                self.serial.write(
                  Buffer.from(str[pos], 'utf8'),
                  /*withoutResponse*/ true
                );
                pos = (pos + 1) % str.length;
                writeLoop();
              }, 1000);
            }
            // writeLoop();
          } else {
            console.log('missing characteristics');
          }
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

noble.startScanning(['dfb0'], false); // any service UUID, allow duplicates
