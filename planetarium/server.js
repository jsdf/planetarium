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

const config = {
  port: 13131,
};

const bleedBroadcast = require('../bleed/beat_advertise');

const DEV = process.env.NODE_ENV === 'development';

const uiRoot = 'dist';

const app = express();
const server = http.Server(app);
const io = socketio(server);
app.use(express.static(uiRoot));

class Server {
  // persistent client state
  state = {
    serverErrors: [],
    queryStates: {},
  };

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
          const newUUID = this.dataToBleedUUID(data);
          console.log('blecast', newUUID, data);
          bleedBroadcast.setUUID(newUUID);
        }
        case 'status': {
        }
      }
    } catch (err) {
      this.handleError(
        `error running RPC: ${cmd} with arg ${JSON.stringify(data)}`,
        err
      );
    }
  }

  dataToBleedUUID({startTime, bpm}) {
    const packet = Buffer.alloc(16);
    // 32 bits gives us 49 days until startTime overflows
    packet.writeUInt32BE(Math.floor(startTime), /* bytes 0-3 */ 0);
    // 0-255
    packet.writeUInt8(Math.floor(bpm), /* byte 4 */ 4);
    // 11 bytes remaining

    return packet.toString('hex');
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
    bleedBroadcast.init();

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
