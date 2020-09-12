import React from 'react';
import logo from './logo.svg';
import debounce from 'debounce';
import './App.css';
import * as ease from 'ease-component';
import * as THREE from 'three';
import useLocalStorage from './useLocalStorage';

import io from 'socket.io-client';

import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {LuminosityShader} from 'three/examples/jsm/shaders/LuminosityShader.js';
import * as makeOrbitControls from 'three-orbit-controls';
import {Noise} from 'noisejs';
import gradients from './gradient';
import interpolateLab from './interpolateLab';

gradients.forEach(
  (g) => (g.colors = g.colors.map((c) => parseInt(c.slice(1), 16)))
);

const programs = [
  'off',
  'pulse',
  /*2*/ 'alternate',
  /*3*/ 'rainbow',
  /*4*/ 'gradient',
  // 'invert',
];
const programIndexes = new Map(programs.map((k, v) => [v, k]));

var searchParams = new URLSearchParams(window.location.search);

const socketPort = parseInt(searchParams.get('port')) || 13131;
const serverHost = searchParams.get('host') || 'rpi4.local';

function serverURL(path) {
  return `http://${serverHost}:${socketPort}${path}`;
}

const OrbitControls = makeOrbitControls(THREE);

var noise = new Noise(Math.random());

const BEAT_WINDOW_SIZE_MS = 2000;

function getBeats(currentOffset, bpm, windowSize = BEAT_WINDOW_SIZE_MS) {
  const stepSize = 60000 / bpm; // how many ms between beats
  const windowStart = currentOffset - windowSize / 2;
  const windowEnd = currentOffset + windowSize / 2;

  const windowStartBeats = Math.floor(windowStart / stepSize);
  const windowEndBeats = Math.ceil(windowEnd / stepSize);
  const beats = [];
  for (let i = windowStartBeats; i <= windowEndBeats; i++) {
    beats.push({id: i, time: i * stepSize});
  }
  return beats;
}

function curve(n, attack, release) {
  if (n < -attack) return 0;
  if (n > release) return 0;
  return n < 0 ? ease.inCube(n / attack + 1) : ease.inCube(1 - n / release);
}

function sampleBeatsIntensity(beats, currentOffset, attack, release) {
  let total = 0;

  // constructively combine curves at time
  for (const beat of beats) {
    const t = currentOffset - beat.time;

    total += Math.max(0, curve(t, attack, release));
  }

  return Math.min(1, total); // clip to 1.0
}

function createRenderLoop(draw) {
  let run = true;
  function step() {
    if (run) {
      requestAnimationFrame(() => {
        draw();
        step();
      });
    }
  }

  step();

  return () => {
    run = false;
  };
}

function renderLog(textRef, logLines) {
  const textEl = textRef.current;
  if (textEl) {
    textEl.innerText = logLines.join('\n');
  }
}

function Canvas2D(props) {
  const canvasRef = React.useRef(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const {windowDimensions} = props;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    var ctx = canvas.getContext('2d');

    const {width, height} = windowDimensions;
    canvas.width = width;
    canvas.height = height;

    function draw() {
      const {
        bpm,
        startTime,
        windowDimensions,
        attack,
        release,
        textRef,
        frameCounter,
      } = propsRef.current;
      const {width, height} = windowDimensions;
      const logLines = [];
      const now = performance.now();
      const currentOffset = now - startTime;
      const beats = getBeats(currentOffset, bpm);
      const intensity = sampleBeatsIntensity(
        beats,
        currentOffset,
        attack,
        release
      );

      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.fillStyle = 'black';
      ctx.fill();

      for (const beat of beats) {
        const posX = beat.time - currentOffset;
        ctx.beginPath();
        ctx.arc(posX + width / 2, height / 2, 50, 0, 2 * Math.PI);
        ctx.strokeStyle = 'white';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 50, 0, 2 * Math.PI);
      const intenseStyle = `rgba(255,255,255,${intensity})`;
      ctx.fillStyle = intenseStyle;
      ctx.fill();

      // ctx.font = '24px monospace';
      // ctx.fillStyle = 'white';
      // ctx.fillText(intenseStyle, 100, height - 100);
      logLines.push(intenseStyle);

      frameCounter.update();
      logLines.push(frameCounter.format());

      renderLog(textRef, logLines);
    }

    const cleanup = createRenderLoop(draw);
    return cleanup;
  }, [windowDimensions]);

  return (
    <canvas
      ref={canvasRef}
      width={windowDimensions.width}
      height={windowDimensions.height}
    />
  );
}

function makeCube() {
  var geometry = new THREE.BoxGeometry(3, 3, 3);
  // var geometry = new THREE.IcosahedronGeometry(3, 0);

  var material = new THREE.MeshBasicMaterial({
    color: 0xffe259,
    transparent: true,
  });
  return new THREE.Mesh(geometry, material);
}

function makeSphere(material) {
  var geometry = new THREE.IcosahedronGeometry(3, 0);

  var material =
    material ||
    new THREE.MeshBasicMaterial({
      color: 0xffe259,
      transparent: true,
    });
  return new THREE.Mesh(geometry, material);
}

class Scroller {
  constructor({rowSize, windowSize, startOffset, enter, exit}) {
    this.rowSize = rowSize;
    this.windowSize = windowSize;
    this.pos = startOffset;
    this.enter = enter;
    this.exit = exit;

    this.traverseWindowQuantized(
      startOffset - windowSize / 2,
      startOffset + windowSize / 2,
      enter
    );
  }

  format() {
    return `pos=${this.pos.toFixed(2)}`;
  }

  traverseWindowQuantized(from, to, fn) {
    const start = Math.floor(from / this.rowSize);
    const end = Math.floor(to / this.rowSize);
    for (var i = start; i < end; i++) {
      fn(i * this.rowSize, i);
    }
  }

  update(nextPos) {
    const delta = nextPos - this.pos;
    const positiveEdge = this.pos + this.windowSize / 2;
    const negativeEdge = this.pos - this.windowSize / 2;

    // exit the stuff on the trailing edge, enter the stuff on the leading edge
    if (delta > 0) {
      // moving forwards
      this.traverseWindowQuantized(
        negativeEdge,
        negativeEdge + delta,
        this.exit
      );
      this.traverseWindowQuantized(
        positiveEdge,
        positiveEdge + delta,
        this.enter
      );
    } else {
      // moving backwards
      this.traverseWindowQuantized(
        positiveEdge + delta,
        positiveEdge,
        this.exit
      );
      this.traverseWindowQuantized(
        negativeEdge + delta,
        negativeEdge,
        this.enter
      );
    }

    this.pos += delta;
  }
}

var waveMaterial = new THREE.LineBasicMaterial({color: 0xbbd2c5});

const waveWidth = 100;
const wavePoints = 100;
const wavePointWidth = waveWidth / wavePoints;
function makeWave(x) {
  const points = [];
  for (var y = 0; y < wavePoints; y++) {
    const height = Math.abs(noise.perlin2(x / 100, y / 100) * 100);
    points.push(
      new THREE.Vector3(x - 50, height - 10, y * wavePointWidth - waveWidth / 2)
    );
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    waveMaterial.clone()
  );
}

var particleMaterial = new THREE.MeshBasicMaterial({
  color: 0xffe259,
  transparent: true,
});

function makeParticle(x) {
  const particle = makeSphere(particleMaterial);
  const y = Math.random();

  const height = Math.abs(noise.perlin2(x / 100, y) * 100);
  particle.position.set(x - 50, height - 10, y * 100 - 50);

  return particle;
}

function scaleToTop(value, proportion) {
  return value * proportion + (1 - proportion);
}

function getColor(gradient, index) {
  const c = gradients[gradient].colors[index];

  return c;
}

function noiseWaves(getProps, canvas) {
  var scene = new THREE.Scene();
  const props = getProps();

  const {windowDimensions} = props;

  scene.fog = new THREE.FogExp2(0x000, 0.01);
  var camera = new THREE.PerspectiveCamera(
    75,
    windowDimensions.width / windowDimensions.height,
    0.1,
    10000
  );

  const orbitControls = new OrbitControls(camera, canvas);

  var renderer = new THREE.WebGLRenderer({canvas});
  renderer.setSize(windowDimensions.width, windowDimensions.height);
  // set up post processing
  var composer = new EffectComposer(renderer);
  var renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // var luminosityPass = new ShaderPass(LuminosityShader);
  // composer.addPass(luminosityPass);

  var cube = makeCube();
  scene.add(cube);

  const waveObj = new THREE.Group();
  const wavesMap = new Map();

  waveObj.position.y = -25;
  waveObj.position.x = 100;
  waveObj.position.z = 0;

  const waveScroller = new Scroller({
    rowSize: 1,
    windowSize: 100,
    startOffset: 0,
    enter: (pos, index) => {
      const wave = makeWave(index);
      wavesMap.set(index, wave);
      waveObj.add(wave);
    },
    exit: (pos, index) => {
      const wave = wavesMap.get(index);
      if (wave) {
        wave.geometry.dispose();
        wave.material.dispose();
      }
      waveObj.remove(wave);
      wavesMap.delete(index);
    },
  });

  scene.add(waveObj);

  const particleObj = new THREE.Group();
  const particlesMap = new Map();

  particleObj.position.y = -25;
  particleObj.position.x = 100;
  particleObj.position.z = 0;

  const particleScroller = new Scroller({
    rowSize: 1,
    windowSize: 100,
    startOffset: 0,
    enter: (pos, index) => {
      if (getProps().generateParticles) {
        const particle = makeParticle(index);
        particlesMap.set(index, particle);
        particleObj.add(particle);
      }
    },
    exit: (pos, index) => {
      const particle = particlesMap.get(index);
      if (particle) {
        particle.geometry.dispose();
        particle.material.dispose();
        particleObj.remove(particle);
        particlesMap.delete(index);
      }
    },
  });

  scene.add(particleObj);

  camera.position.x = 10;
  camera.lookAt(cube.position);

  const black = new THREE.Color('black');
  const white = new THREE.Color('white');

  function draw(
    {
      bpm,
      startTime,
      attack,
      release,
      textRef,
      frameCounter,
      scroll,
      logLines,
      gradient,
      phrase,
      program,
    },
    prevProps
  ) {
    cube.rotation.z += 0.002;
    cube.rotation.y += 0.01;
    cube.rotation.x += 0.01;
    // waveObj.rotation.z += 0.002;
    // waveObj.rotation.y += 0.01;
    // waveObj.rotation.x += 0.01;
    orbitControls.update();

    const now = performance.now();
    const currentOffset = now - startTime;
    const beats = getBeats(currentOffset, bpm);
    const intensity = sampleBeatsIntensity(
      beats,
      currentOffset,
      attack,
      release
    );
    scene.background = program == programIndexes.get('invert') ? white : black;
    scene.fog.color = program == programIndexes.get('invert') ? white : black;

    const intensity8beats = sampleBeatsIntensity(
      getBeats(currentOffset, bpm / 16, 12000),
      currentOffset,
      attack / 2,
      release / 2
    );
    cube.scale.setScalar(scaleToTop(intensity, 0.25));
    cube.material.opacity = scaleToTop(intensity, 0.25);
    cube.material.wireframe = intensity < 0.7 || true;
    cube.material.color.setHex(getColor(gradient, 1));

    // camera.zoom = intensity8beats;

    waveObj.position.x += 1 /*+ intensity8beats * -2*/;
    // console.log(1 * (1 - intensity8beats));
    waveScroller.update(-waveObj.position.x);
    waveObj.scale.z = scaleToTop(intensity, 1 / 16);
    waveMaterial.color.setHex(getColor(gradient, 0));

    particleObj.position.x += 1;
    particleScroller.update(-particleObj.position.x);
    particleMaterial.color.setHex(getColor(gradient, 1));
    particleMaterial.wireframe = intensity < 0.7;

    const gradientInterp = interpolateLab(
      '#' + getColor(gradient, 0).toString(16),
      '#' + getColor(gradient, 1).toString(16)
    );

    wavesMap.forEach((wave, index) => {
      const res = gradientInterp((index % 100) / 100);

      // wave.material.color.setHex(res);
    });

    logLines.push(waveScroller.format());
    logLines.push(`intensity=${intensity.toFixed(2)}`);

    // renderer.render(scene, camera);
    composer.render();
  }

  return {draw};
}

const layers = {
  noiseWaves: noiseWaves,
};

function ThreeCanvas(props) {
  const [layerType, setLayerType] = React.useState('noiseWaves');
  const [restartCounter, setRestartCounter] = React.useState(0);
  const canvasRef = React.useRef(null);
  const propsRef = React.useRef(props);
  const prevPropsRef = React.useRef(props);
  prevPropsRef.current = propsRef.current;
  propsRef.current = props;

  const {windowDimensions, frameCounter, textRef} = props;

  const handleKeyDown = React.useCallback((e) => {
    // Object.keys(layers)
  });

  React.useEffect(() => {
    const {canvas} = canvasRef;
    if (canvas == null) {
      return;
    }

    canvas.addEventListener(
      'webglcontextlost',
      function (event) {
        setRestartCounter((c) => c + 1);
      },
      false
    );

    canvas.addEventListener(
      'webglcontextrestored',
      function (event) {
        setRestartCounter((c) => c + 1);
      },
      false
    );
  }, []);

  React.useEffect(() => {
    if (canvasRef.current == null) {
      return;
    }

    const makeLayer = layers[layerType];
    const layer = makeLayer(() => propsRef.current, canvasRef.current);

    const cleanupRenderLoop = createRenderLoop(() => {
      const logLines = [];
      layer.draw({...propsRef.current, logLines}, prevPropsRef.current);

      frameCounter.update();
      logLines.push(frameCounter.format());

      renderLog(textRef, logLines);
    });
    return () => {
      layer.cleanup && layer.cleanup();
      cleanupRenderLoop();
    };
  }, [windowDimensions, layerType, restartCounter]);

  return (
    <canvas
      ref={canvasRef}
      width={windowDimensions.width}
      height={windowDimensions.height}
      onKeyDown={handleKeyDown}
    />
  );
}

function Range({label, onChange, ...passthroughProps}) {
  return (
    <label className="Range">
      {label}
      <input
        type="text"
        {...passthroughProps}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
      />
      <input
        type="range"
        {...passthroughProps}
        onChange={(e) => onChange(parseFloat(e.currentTarget.value))}
      />
    </label>
  );
}

function Select({options, label, value, onChange}) {
  return (
    <label className="Select">
      {label}
      <select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        {options.map((option, i) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TapBPM({onBPM, onStartTime, children}) {
  const tapRef = React.useRef([]);

  const handleTap = React.useCallback(
    (e) => {
      //e.preventDefault();
      e.stopPropagation();

      const taps = tapRef.current;
      const now = performance.now();
      const prevTap = taps[taps.length - 1];

      // if it's been too long since last tap, reset. throw out any really old taps
      const recentTaps = (prevTap == null || prevTap < now - 1400
        ? []
        : taps
      ).filter((time) => time > now - 5000);

      recentTaps.push(now);

      // const last4 = recentTaps.slice(Math.max(recentTaps.length - 4, 0));

      tapRef.current = recentTaps;
      if (recentTaps.length >= 4) {
        // take the mean time between taps
        const meanInterval =
          (recentTaps[recentTaps.length - 1] - recentTaps[0]) /
          (recentTaps.length - 1);
        onBPM(Math.max(0, Math.min(250, 60000 / meanInterval)));
        onStartTime(recentTaps[0]);
      }
    },
    [onBPM, onStartTime]
  );

  const handleKeyDown = React.useCallback(
    (e) => {
      if (e.key == ' ') {
        handleTap(e);
      }
    },
    [handleTap]
  );

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return <div onPointerDown={handleTap}>{children}</div>;
}

function roundTo3DP(num) {
  return Math.round(num * 1000) / 1000;
}

class FrameCounter {
  frame = 0;
  // for avg frame count
  lastAvgFrameCount = 0;
  // for avg frame time
  frameTimeSum = 0;
  lastAvgFrameTime = 0;
  lastFrameStart = performance.now();

  update() {
    const now = performance.now();
    // every 60 frames, calculate avg frame time
    this.frameTimeSum += now - this.lastFrameStart;
    this.lastFrameStart = now;
    if (this.frame % 60 === 0) {
      this.lastAvgFrameTime = this.frameTimeSum / 60;
      this.lastAvgFrameCount = 1000 / this.lastAvgFrameTime;
      // reset
      this.frameTimeSum = 0;
    }

    this.frame++;
  }

  format() {
    return `fps=${this.lastAvgFrameCount.toFixed(
      1
    )} frametime=${this.lastAvgFrameTime.toFixed(2)}ms`;
  }
}

let bleSyncMessage = null;
const flushBLESyncMessage = debounce(() => {
  if (!bleSyncMessage) return;

  const {api, ...rest} = bleSyncMessage;

  console.log('api.sendCommand blecast', rest);
  api.sendCommand('blecast', rest);
}, 100);

function sendBLESyncMessage(message) {
  bleSyncMessage = message;
  flushBLESyncMessage();
}

function App() {
  const [view, setView] = useLocalStorage('view', '3d');
  const [bpm, setBPM] = React.useState(120);
  const [startTime, setStartTime] = React.useState(performance.now());
  const [scroll, setScroll] = React.useState(0);
  const [showHUD, setShowHUD] = React.useState(true);
  const [generateParticles, setGenerateParticles] = React.useState(false);
  const [gradient, setGradient] = React.useState(0);
  const [program, setProgram] = React.useState(1);
  const [energy, setEnergy] = React.useState(500);

  const [attack, setAttack] = React.useState(100);
  const [release, setRelease] = React.useState(600);
  const [phrase, setPhrase] = React.useState(0);

  const [windowDimensions, setWindowDimensions] = React.useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const textRef = React.useRef(null);
  const frameCounterRef = React.useRef(null);
  if (frameCounterRef.current == null) {
    frameCounterRef.current = new FrameCounter();
  }
  const frameCounter = frameCounterRef.current;

  React.useEffect(() => {
    window.addEventListener(
      'resize',
      debounce(() => {
        setWindowDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 300)
    );
  }, []);

  const handleKeyDown = React.useCallback((e) => {
    console.log(e.key);
    switch (e.key) {
      case 'q':
        setAttack((v) => Math.min(v + 100, 1000));
        break;
      case 'e':
        setRelease((v) => Math.min(v + 100, 1000));
        break;
      case 'h':
        setShowHUD((v) => !v);
        break;
      case 'p':
        setGenerateParticles(true);
        break;
      case 'c':
      case 'g':
        setGradient((g) => (g + 1) % gradients.length);
        break;
      case 'ArrowUp':
        setEnergy((e) => Math.min(e + 100, 1000));
        break;
      case 'ArrowDown':
        setEnergy((e) => Math.max(e - 100, 0));
        break;
      case 'ArrowLeft':
        setProgram((s) => (s === 1 ? programs.length - 1 : s - 1));
        break;
      case 'ArrowRight':
        setProgram((s) => (s === programs.length - 1 ? 1 : s + 1));
        break;
    }
  }, []);

  const handleKeyUp = React.useCallback((e) => {
    console.log(e.key);
    switch (e.key) {
      case 'a':
        setRelease((v) => Math.max(v - 100, 0));
        break;
      case 'd':
        setRelease((v) => Math.max(v - 100, 0));
        break;
      case 'p':
        setGenerateParticles(false);
        break;
    }
  }, []);

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => document.removeEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keyup', handleKeyUp);
  }, [handleKeyDown]);

  // server stuff
  const [serverState, setServerState] = React.useState(null);
  const [clientErrors, setClientErrors] = React.useState([]);
  let apiRef = React.useRef(null);

  React.useEffect(() => {
    // create socket connection
    const socket = io.connect(serverURL(''));
    socket.on('state', (newState) => {
      console.log(newState);
      setServerState(newState);
    });
    socket.on('disconnect', () => {
      console.log('got disconnect message');
      setClientErrors((prev) =>
        prev.concat({
          message: 'disconnected',
          error: null,
        })
      );
    });
    socket.on('error', (error) => {
      console.log('got error message', error);
      setClientErrors((prev) =>
        prev.concat({
          message: 'io error',
          error: error,
        })
      );
    });

    const api = {
      sendCommand(cmd, data) {
        socket.emit('cmd', {cmd, data});
      },
    };
    apiRef.current = api;

    socket.on('connect', () => {
      const clientTime = performance.now();
      console.log('syncTime', {clientTime});
      api.sendCommand('syncTime', {clientTime});

      sendBLESyncMessage({
        api,
        bpm,
        startTime,
        gradient,
        energy,
        attack,
        release,
        program,
      });
    });
  }, []);

  // expose server state for debugging
  React.useEffect(() => {
    window.serverDebug = {
      apiRef,
      serverState,
      clientErrors,
    };
  }, [serverState, clientErrors]);

  // send broadcast upon bpm/startTime change
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api) return;

    sendBLESyncMessage({
      api,
      bpm,
      startTime,
      gradient,
      energy,
      attack,
      release,
      program,
    });
  }, [bpm, startTime, gradient, energy, attack, release, program]);

  React.useEffect(() => {
    let beatTimer = null;

    function enqueueNextPhraseTimer() {
      if (beatTimer) {
        clearTimeout(beatTimer);
      }
      const currentOffset = performance.now() - startTime;
      const period = 60000 / (bpm / 32); // every 32 beats
      // quantize to beat, rounding up (ceil), then interpolate back to ms
      const nextBeatTime = Math.ceil(currentOffset / period) * period;

      beatTimer = setTimeout(() => {
        // setPhrase((v) => v + 1);
        setGradient((g) => (g + 1) % gradients.length);
        enqueueNextPhraseTimer();
      }, nextBeatTime - currentOffset - 10);
    }
    enqueueNextPhraseTimer();

    return () => {
      clearTimeout(beatTimer);
    };
  }, [bpm, startTime, program]);

  const rendererProps = {
    bpm,
    startTime,
    windowDimensions,
    attack,
    release,
    textRef,
    frameCounter,
    scroll,
    gradient,
    energy,
    program,
    phrase,
    generateParticles,
  };

  const beatPeriod = 60000 / bpm;

  return (
    <div>
      {showHUD && (
        <div style={{position: 'absolute', top: 16, left: 16}}>
          <div>
            <label>jog: </label>
            <button onClick={() => setStartTime((s) => s - 10)}>&larr;</button>
            <button onClick={() => setStartTime((s) => s + 10)}>
              &rarr;
            </button>{' '}
            {Math.round(((startTime % beatPeriod) / beatPeriod) * 100)} %
          </div>
          <div>
            <label>color: </label>
            <button
              onClick={() =>
                setGradient((s) => (s === 0 ? gradients.length - 1 : s - 1))
              }
            >
              &larr;
            </button>
            <button
              onClick={() => setGradient((s) => (s + 1) % gradients.length)}
            >
              &rarr;
            </button>{' '}
            {gradients[gradient].name}{' '}
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor:
                  '#' + gradients[gradient].colors[0].toString(16),
                display: 'inline-block',
                border: 'solid 1px white',
              }}
            />
            <div
              style={{
                width: 20,
                height: 20,
                backgroundColor:
                  '#' + gradients[gradient].colors[1].toString(16),
                display: 'inline-block',
                border: 'solid 1px white',
              }}
            />
          </div>
          <div>
            <label>program: </label>
            <button
              onClick={() =>
                setProgram((s) => (s === 0 ? programs.length - 1 : s - 1))
              }
            >
              &larr;
            </button>
            <button
              onClick={() => setProgram((s) => (s + 1) % programs.length)}
            >
              &rarr;
            </button>{' '}
            {programs[program]}
          </div>
          <Select
            label="view: "
            options={['none', '2d', '3d']}
            value={view}
            onChange={setView}
          />
          <Range
            label="bpm: "
            min={40}
            max={250}
            value={roundTo3DP(bpm)}
            onChange={setBPM}
          />
          <Range
            label="energy: "
            min={0}
            max={1000}
            value={energy}
            onChange={setEnergy}
          />
          <Range
            label="attack: "
            min={0}
            max={1000}
            value={attack}
            onChange={setAttack}
          />
          <Range
            label="release: "
            min={0}
            max={1000}
            value={release}
            onChange={setRelease}
          />
        </div>
      )}
      <TapBPM onBPM={setBPM} onStartTime={setStartTime}>
        {view === 'none' ? null : view === '2d' ? (
          <Canvas2D {...rendererProps} />
        ) : (
          <ThreeCanvas {...rendererProps} />
        )}
      </TapBPM>

      {showHUD && (
        <pre
          style={{position: 'absolute', bottom: 16, left: 16, fontSize: 16}}
          ref={textRef}
        />
      )}
    </div>
  );
}

export default App;
