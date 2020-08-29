const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

const path = '/dev/tty.usbmodem14101';

const port = new SerialPort(path, {baudRate: 115200});

// const parser = new Readline();
// port.pipe(parser);

function write(data) {
  return new Promise((resolve) => {
    if (!port.write(data)) {
      // port.once('drain', resolve);
      setTimeout(resolve, 1000);
    } else {
      // process.nextTick(resolve);
      setTimeout(resolve, 1000);
    }
  });
}

port.on('data', (line) => console.log(`> ${line}`));

async function run() {
  await write('+++');

  await write('AT+RSSI=?\r\n');
}

run();
