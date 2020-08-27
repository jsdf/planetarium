import React from 'react';
import logo from './logo.svg';
import debounce from 'debounce';
import './App.css';
import * as ease from 'ease-component';
import * as THREE from 'three';
import useLocalStorage from './useLocalStorage';

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

function Canvas({bpm, startTime, windowDimensions, attack, release}) {
  const canvasRef = React.useRef(null);

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
        ctx.arc(posX + width / 2, 75, 50, 0, 2 * Math.PI);
        ctx.strokeStyle = 'white';
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(width / 2, 75, 50, 0, 2 * Math.PI);
      const intenseStyle = `rgba(255,255,255,${intensity})`;
      ctx.fillStyle = intenseStyle;
      ctx.fill();

      ctx.font = '24px monospace';
      ctx.fillStyle = 'white';
      ctx.fillText(intenseStyle, 100, height - 100);
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

function WebGL(props) {
  const canvasRef = React.useRef(null);
  const propsRef = React.useRef(props);
  propsRef.current = props;

  const {windowDimensions} = props;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(
      75,
      windowDimensions.width / windowDimensions.height,
      0.1,
      1000
    );

    var renderer = new THREE.WebGLRenderer({canvas});
    renderer.setSize(windowDimensions.width, windowDimensions.height);
    var geometry = new THREE.BoxGeometry();
    var material = new THREE.MeshBasicMaterial({color: 0x00ff00});
    var cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    function draw() {
      const {bpm, startTime, attack, release} = propsRef.current;
      cube.rotation.z += 0.002;
      cube.rotation.y += 0.01;
      cube.rotation.x += 0.01;

      const now = performance.now();
      const currentOffset = now - startTime;
      const beats = getBeats(currentOffset, bpm);
      const intensity = sampleBeats(beats, currentOffset, attack, release);
      cube.scale.setScalar(intensity / 4 + 3 / 4);

      renderer.render(scene, camera);
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

function Range({label, onChange, ...passthroughProps}) {
  return (
    <label>
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
    <label>
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

  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
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

        const last4 = recentTaps.slice(Math.max(recentTaps.length - 4, 0));

        tapRef.current = last4;
        if (last4.length == 4) {
          // take the mean time between taps
          const meanInterval = (last4[3] - last4[0]) / 3;
          onBPM(60000 / meanInterval);
          onStartTime(last4[0]);
        }
      }}
    >
      {children}
    </div>
  );
}

function roundTo3DP(num) {
  return Math.round(num * 1000) / 1000;
}

function App() {
  const [view, setView] = useLocalStorage('view', '2d');
  const [bpm, setBPM] = React.useState(120);
  const [startTime, setStartTime] = React.useState(performance.now());

  const [attack, setAttack] = React.useState(100);
  const [release, setRelease] = React.useState(600);

  const [windowDimensions, setWindowDimensions] = React.useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

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

  return (
    <div>
      <div style={{position: 'absolute', top: 0, left: 0}}>
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
        <Range
          label="bpm: "
          min={40}
          max={240}
          value={roundTo3DP(bpm)}
          onChange={setBPM}
        />
        <Select
          label="view: "
          options={['2d', '3d']}
          value={view}
          onChange={setView}
        />
      </div>
      <TapBPM onBPM={setBPM} onStartTime={setStartTime}>
        {view === '2d' ? (
          <Canvas {...{bpm, startTime, windowDimensions, attack, release}} />
        ) : (
          <WebGL {...{bpm, startTime, windowDimensions, attack, release}} />
        )}
      </TapBPM>
    </div>
  );
}

export default App;
