import React from 'react';
import logo from './logo.svg';
import debounce from 'debounce';
import './App.css';
import * as ease from 'ease-component';
import * as THREE from 'three';
import useLocalStorage from './useLocalStorage';

import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {LuminosityShader} from 'three/examples/jsm/shaders/LuminosityShader.js';
import * as makeOrbitControls from 'three-orbit-controls';
import {Noise} from 'noisejs';

const OrbitControls = makeOrbitControls(THREE);

var noise = new Noise(Math.random());

const BEAT_WINDOW_SIZE_MS = 2000;

function getBeats(currentOffset, bpm) {
  const stepSize = 60000 / bpm; // how many ms between beats
  const windowStart = currentOffset - BEAT_WINDOW_SIZE_MS / 2;
  const windowEnd = currentOffset + BEAT_WINDOW_SIZE_MS / 2;

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

// constructively combine curves at time
function sampleBeats(beats, currentOffset, attack, release) {
  let total = 0;

  for (const beat of beats) {
    const t = currentOffset - beat.time;

    total += Math.max(0, curve(t, attack, release));
  }

  return total;
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
      const intensity = sampleBeats(beats, currentOffset, attack, release);

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
  var material = new THREE.MeshBasicMaterial({
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
    const start = Math.ceil(from / this.rowSize);
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
    waveMaterial
  );
}

function scaleToTop(value, proportion) {
  return value * proportion + (1 - proportion);
}

function noiseWaves(props, canvas) {
  var scene = new THREE.Scene();

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
      waveObj.remove(wavesMap.get(index));
      wavesMap.delete(index);
    },
  });

  scene.add(waveObj);

  camera.position.x = 10;
  camera.lookAt(cube.position);

  function draw({
    bpm,
    startTime,
    attack,
    release,
    textRef,
    frameCounter,
    scroll,
    logLines,
  }) {
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
    const intensity = sampleBeats(beats, currentOffset, attack, release);
    cube.scale.setScalar(scaleToTop(intensity, 0.25));
    cube.material.opacity = scaleToTop(intensity, 0.25);
    cube.material.wireframe = intensity < 0.7;

    waveObj.position.x += 1;
    waveScroller.update(-waveObj.position.x);
    waveObj.scale.z = scaleToTop(intensity, 1 / 16);

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
  const canvasRef = React.useRef(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const {windowDimensions, frameCounter, textRef} = props;

  const handleKeyDown = React.useCallback((e) => {
    // Object.keys(layers)
  });

  React.useEffect(() => {
    if (canvasRef.current == null) {
      return;
    }

    const makeLayer = layers[layerType];
    const layer = makeLayer(propsRef.current, canvasRef.current);

    const cleanupRenderLoop = createRenderLoop(() => {
      const logLines = [];
      layer.draw({...propsRef.current, logLines});

      frameCounter.update();
      logLines.push(frameCounter.format());

      renderLog(textRef, logLines);
    });
    return () => {
      layer.cleanup && layer.cleanup();
      cleanupRenderLoop();
    };
  }, [windowDimensions, layerType]);

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

  const handleTap = (e) => {
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
      onBPM(60000 / meanInterval);
      onStartTime(recentTaps[0]);
    }
  };

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

function App() {
  const [view, setView] = useLocalStorage('view', '2d');
  const [bpm, setBPM] = React.useState(120);
  const [startTime, setStartTime] = React.useState(performance.now());
  const [scroll, setScroll] = React.useState(0);

  const [attack, setAttack] = React.useState(100);
  const [release, setRelease] = React.useState(600);

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
  });

  const rendererProps = {
    bpm,
    startTime,
    windowDimensions,
    attack,
    release,
    textRef,
    frameCounter,
    scroll,
  };

  const beatPeriod = 60000 / bpm;

  return (
    <div>
      <div style={{position: 'absolute', top: 16, left: 16}}>
        <div>
          <label>jog: </label>
          <button onClick={() => setStartTime((s) => s - 10)}>&larr;</button>
          <button onClick={() => setStartTime((s) => s + 10)}>
            &rarr;
          </button>{' '}
          {Math.round(((startTime % beatPeriod) / beatPeriod) * 100)} %
        </div>
        <Select
          label="view: "
          options={['2d', '3d']}
          value={view}
          onChange={setView}
        />
        <Range
          label="bpm: "
          min={40}
          max={240}
          value={roundTo3DP(bpm)}
          onChange={setBPM}
        />
        <Range
          label="scroll: "
          min={0}
          max={1000}
          value={scroll}
          onChange={setScroll}
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
      <TapBPM onBPM={setBPM} onStartTime={setStartTime}>
        {view === '2d' ? (
          <Canvas2D {...rendererProps} />
        ) : (
          <ThreeCanvas {...rendererProps} />
        )}
      </TapBPM>

      <pre
        style={{position: 'absolute', bottom: 16, left: 16, fontSize: 16}}
        ref={textRef}
      />
    </div>
  );
}

export default App;
