#!/usr/bin/env node

const http = require('http');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const getPort = require('get-port');
const express = require('express');
const socketio = require('socket.io');
const fs = require('fs');
const path = require('path');

const performanceNow = require('performance-now');

// zero should be fine as performanceNow is relative to start time
let serverStartupTime = 0;
// how much the ui is behind (probably) compared to the server
// add this to any time sent from the ui
let uiTimeDelta = 0;

const config = {
  port: 13131,
};
const BLE_BROADCAST = true;

let bleedAPI;
if (BLE_BROADCAST) {
  bleedAPI = require('../bleed/beat_advertise');
} else {
  bleedAPI = require('../bleed/beat_connect');
}

const DEV = process.env.NODE_ENV === 'development';

const uiRoot = 'build';

const app = express();
const server = http.Server(app);
const io = socketio(server);
app.use(express.static(uiRoot));

function getBeatPeriod(bpm) {
  return 60000 / bpm;
}

function getNextBeatOffset(currentOffset, period) {
  // quantize to beat, rounding up (ceil), then interpolate back to ms
  return Math.ceil(currentOffset / period) * period;
}

class Server {
  // persistent client state
  state = {
    serverErrors: [],
    queryStates: {},
  };

  beatTimer = null;

  setState(stateUpdate) {
    console.error('setState', Object.keys(stateUpdate));
    Object.assign(this.state, stateUpdate);
    io.emit('state', this.state);
  }

  handleError(message, error) {
    console.error(message, error);
    this.setState({
      serverErrors: this.state.serverErrors.concat({
        message,
        error: error.stack,
      }),
    });
  }

  // RPC from client
  async handleCommand(cmd, data) {
    try {
      switch (cmd) {
        case 'blecast': {
          // this.enqueueNextBeatTimer(data)

          if (BLE_BROADCAST) {
            const packet = this.dataToPacket(data);
            console.log('blecast', packet.toString('hex'), data);
            bleedAPI.setUUID(packet);
          } else {
            console.log('blecast', data);
            bleedAPI.sendPacket(this.dataToPacket(data));
          }
          return;
        }
        case 'syncTime': {
          const serverTime = performanceNow();
          const {clientTime} = data;
          uiTimeDelta = serverTime - clientTime;
          console.log('syncTime', {data, uiTimeDelta, serverTime, clientTime});
          return;
        }
      }
    } catch (err) {
      this.handleError(
        `error running RPC: ${cmd} with arg ${JSON.stringify(data)}`,
        err
      );
    }
  }

  enqueueNextBeatTimer(data) {
    if (this.beatTimer) {
      clearTimeout(this.beatTimer);
    }
    const {startTime, bpm} = data;
    const startTimeServer = startTime + uiTimeDelta;
    const currentOffset = performanceNow() - startTimeServer;
    const period = getBeatPeriod(bpm);
    const nextBeatTime = getNextBeatOffset(currentOffset, period);

    this.beatTimer = setTimeout(() => {
      console.log('beat', {
        bpm,
        period,
        nextBeatTime,
        currentOffset,
        startTimeServer,
      });
      this.enqueueNextBeatTimer(data);
    }, nextBeatTime - currentOffset);
  }

  dataToPacket({startTime, bpm, gradient, energy, attack, release, program}) {
    const packet = Buffer.alloc(16);
    // 32 bits signed gives us 24 days until startTime overflows
    // by adding uiTimeDelta to the startTime (from ui), we provide startTime in server time.
    // the ble clients can then use their known delta from server time to calculate
    // client-adjusted startTime value
    packet.writeInt32BE(Math.floor(startTime + uiTimeDelta), /* bytes 0-3 */ 0);
    // 0-255
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, bpm))),
      /* byte */ 4
    );
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, gradient))),
      /* byte */ 5
    );
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, 255 * (energy / 1000)))),
      /* byte */ 6
    );
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, 255 * (attack / 600)))),
      /* byte */ 7
    );
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, 255 * (release / 600)))),
      /* byte */ 8
    );
    packet.writeUInt8(
      Math.floor(Math.max(0, Math.min(255, program))),
      /* byte */ 9
    );
    // 4 bytes remaining
    return packet;
  }

  dataToBleedUUID(data) {
    return this.dataToPacket(data).toString('hex');
  }

  attachClientHandlers(socket) {
    // send current state on connect
    socket.emit('state', this.state);

    // subscribe to handle commands send from client
    socket.on('cmd', ({cmd, data}) => {
      this.handleCommand(cmd, data);
    });
  }

  async startServer(httpPort) {
    bleedAPI.setServicesImpl({
      getServerTime() {
        return performanceNow();
      },
    });
    bleedAPI.init();

    server.listen(httpPort);

    app.get('/', (req, res) => {
      if (DEV) {
        res.redirect(301, `http://127.0.0.1:3000/?port=${httpPort}`);
      } else {
        res.sendFile(path.join(__dirname, uiRoot, 'index.html'));
      }
    });

    app.get('/example', (req, res) => {
      res.set('Access-Control-Allow-Origin', '*');
      Promise.resolve({hi: 'you'})
        .then((data) => {
          res.json(data);
        })
        .catch((err) => {
          res.status(503).type('text').send(err.stack);
        });
    });

    io.on('connection', (socket) => {
      this.attachClientHandlers(socket);
    });

    console.log(`server running at http://127.0.0.1:${httpPort}`);
  }
}

(config.port ? Promise.resolve(config.port) : getPort())
  .then(async (httpPort) => {
    await new Server().startServer(httpPort);
    return httpPort;
  })
  .then(async (httpPort) => {
    if (!DEV) {
      return;
    }

    console.log('opening ui');

    spawn('npm', ['start'], {
      env: {
        ...process.env,
        BROWSER: 'none',
      },
    });
    setTimeout(() => {
      exec(`open http://127.0.0.1:${httpPort}/`);
    }, 1000);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
