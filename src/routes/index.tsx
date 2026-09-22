import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gauge, Gem, Headphones, Pause, Play, RotateCcw, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type PowerType = "magnet" | "jetpack" | "shield" | "boost";
type ObstacleType = "barrier" | "train" | "tunnel";
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Entity = { lane: number; z: number; type: ObstacleType | "coin" | PowerType; spin: number; collected?: boolean; passed?: boolean };

type Palette = {
  void: string; ink: string; panel: string; panelAlt: string; line: string; cyan: string; lime: string; coral: string; yellow: string; violet: string; train: string; rail: string; fog: string;
};

const defaultPalette: Palette = { void: "#07131f", ink: "#f2f7f5", panel: "#102535", panelAlt: "#163347", line: "#36576a", cyan: "#46e0d0", lime: "#b6ee63", coral: "#ff716b", yellow: "#ffd166", violet: "#b88cff", train: "#ef806d", rail: "#9ab1ba", fog: "#183a4b" };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rail//Rush — Neon Subway Runner" },
      { name: "description", content: "Sprint through a living neon subway, dodge trains, collect power-ups, and chase your high score." },
      { property: "og:title", content: "Rail//Rush — Neon Subway Runner" },
      { property: "og:description", content: "A fast, original endless runner built for keyboard and touch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RailRush,
});

const missions = [
  { label: "Line runner", detail: "Travel 500 m", icon: "↗", target: 500 },
  { label: "Pocket change", detail: "Collect 30 coins", icon: "◈", target: 30 },
  { label: "Clean getaway", detail: "Dodge 12 hazards", icon: "✦", target: 12 },
];

function getPalette(): Palette {
  if (typeof document === "undefined") return defaultPalette;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return { void: read("--game-void", defaultPalette.void), ink: read("--game-ink", defaultPalette.ink), panel: read("--game-panel", defaultPalette.panel), panelAlt: read("--game-panel-alt", defaultPalette.panelAlt), line: read("--game-line", defaultPalette.line), cyan: read("--game-cyan", defaultPalette.cyan), lime: read("--game-lime", defaultPalette.lime), coral: read("--game-coral", defaultPalette.coral), yellow: read("--game-yellow", defaultPalette.yellow), violet: read("--game-violet", defaultPalette.violet), train: read("--game-train", defaultPalette.train), rail: read("--game-rail", defaultPalette.rail), fog: read("--game-fog", defaultPalette.fog) };
}

function RailRush() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const gameRef = useRef<RunnerState | null>(null);
  const audioRef = useRef<AudioController | null>(null);
  const [phase, setPhase] = useState<"ready" | "running" | "paused" | "gameover">("ready");
  const [hud, setHud] = useState({ score: 0, coins: 0, distance: 0, speed: 1, power: null as PowerType | null, powerTime: 0, dodged: 0 });
  const [highScore, setHighScore] = useState(0);
  const [bestDistance, setBestDistance] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState("Ready on platform 09");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const storedScore = Number(localStorage.getItem("railrush-high-score") || 0);
    const storedDistance = Number(localStorage.getItem("railrush-best-distance") || 0);
    setHighScore(storedScore);
    setBestDistance(storedDistance);
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) event.preventDefault();
      if (event.key.toLowerCase() === "p") {
        setPhase((current) => current === "running" ? "paused" : current === "paused" ? "running" : current);
        return;
      }
      if (phaseRef.current !== "running") {
        if (event.key === "Enter" || event.key === " ") startRun();
        return;
      }
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") move(-1);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") move(1);
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.key === " ") jump();
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") slide();
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const finishRun = useCallback(() => {
    const state = gameRef.current;
    if (!state) return;
    const finalScore = Math.floor(state.score);
    const finalDistance = Math.floor(state.distance);
    const nextBest = Math.max(highScore, finalScore);
    const nextDistance = Math.max(bestDistance, finalDistance);
    localStorage.setItem("railrush-high-score", String(nextBest));
    localStorage.setItem("railrush-best-distance", String(nextDistance));
    setHighScore(nextBest);
    setBestDistance(nextDistance);
    setPhase("gameover");
    phaseRef.current = "gameover";
    audioRef.current?.hit();
  }, [bestDistance, highScore]);

  const updateHud = useCallback((state: RunnerState) => {
    setHud({ score: Math.floor(state.score), coins: state.coins, distance: Math.floor(state.distance), speed: Math.min(9, 1 + Math.floor(state.distance / 160)), power: state.power, powerTime: Math.ceil(state.powerTime), dodged: state.dodged });
  }, []);

  const startRun = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    audioRef.current?.start();
    const state = createRunnerState();
    state.palette = getPalette();
    gameRef.current = state;
    setPhase("running");
    phaseRef.current = "running";
    setToast("Run live // platform 09");
    updateHud(state);
  }, [updateHud]);

  const move = useCallback((direction: number) => {
    const state = gameRef.current;
    if (!state || phaseRef.current !== "running") return;
    state.playerLane = Math.max(-1, Math.min(1, state.playerLane + direction));
    state.targetLane = state.playerLane;
    audioRef.current?.blip(260 + state.playerLane * 40, 0.045);
  }, []);

  const jump = useCallback(() => {
    const state = gameRef.current;
    if (!state || phaseRef.current !== "running" || state.jump > 0.01 || state.slide > 0) return;
    state.jump = 1;
    audioRef.current?.blip(560, 0.12);
  }, []);

  const slide = useCallback(() => {
    const state = gameRef.current;
    if (!state || phaseRef.current !== "running" || state.jump > 0.2) return;
    state.slide = 0.62;
    audioRef.current?.blip(180, 0.1);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (gameRef.current) { gameRef.current.width = rect.width; gameRef.current.height = rect.height; }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    let previous = performance.now();
    const loop = (now: number) => {
      const delta = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const state = gameRef.current;
      if (state && phaseRef.current === "running") {
        updateRunner(state, delta);
        updateHud(state);
        if (state.dead) finishRun();
      }
      drawScene(context, state, canvas.clientWidth, canvas.clientHeight);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => { observer.disconnect(); if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [finishRun, updateHud]);

  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>) => {
    const point = event.touches[0];
    if (point) touchStartRef.current = { x: point.clientX, y: point.clientY };
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLCanvasElement>) => {
    const start = touchStartRef.current;
    const point = event.changedTouches[0];
    if (!start || !point) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    touchStartRef.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { if (phaseRef.current !== "running") startRun(); return; }
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else slide();
  };

  const missionProgress = [Math.min(hud.distance, 500), Math.min(hud.coins, 30), Math.min(hud.dodged, 12)];
  const activatePower = hud.power ? powerLabel(hud.power) : null;

  return (
    <main className="runner-app">
      <header className="runner-header">
        <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div><div><p className="brand-name">RAIL<span>//</span>RUSH</p><p className="brand-subtitle">NEON SUBWAY LEAGUE · SEASON 01</p></div></div>
        <div className="header-actions">
          <span className="live-pill"><i /> LIVE RUN</span>
          <Button variant="ghost" size="icon" className="icon-button" aria-label={soundOn ? "Mute sound" : "Turn sound on"} onClick={() => { setSoundOn((on) => !on); audioRef.current?.toggle(!soundOn); }}><Headphones size={16} /></Button>
          <Button variant="ghost" size="icon" className="icon-button" aria-label={phase === "paused" ? "Resume run" : "Pause run"} onClick={() => setPhase((current) => current === "running" ? "paused" : current === "paused" ? "running" : current)}>{phase === "paused" ? <Play size={16} /> : <Pause size={16} />}</Button>
        </div>
      </header>

      <section className="runner-layout">
        <div className="game-shell">
          <div className="game-toolbar"><span><span className="route-dot" /> ROUTE 09 <em>·</em> EASTBOUND</span><span className="game-tip">SWIPE OR ARROW KEYS TO MOVE</span></div>
          <div className="canvas-wrap">
            <canvas ref={canvasRef} className="game-canvas" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} aria-label="Rail Rush endless runner game" />
            <div className="canvas-vignette" />
            <div className="run-overlay overlay-top"><span>RUN SCORE</span><strong>{hud.score.toLocaleString()}</strong><small>BEST {highScore.toLocaleString()}</small></div>
            {activatePower && <div className="power-badge"><Zap size={13} /> {activatePower}<b>{hud.powerTime}s</b></div>}
            {phase === "ready" && <div className="start-overlay"><div className="start-kicker"><Sparkles size={14} /> NIGHT SERVICE OPEN</div><h1>RUN THE<br /><span>RAILS.</span></h1><p>One line. No brakes. Keep moving.</p><Button variant="hero" size="lg" onClick={startRun}><Play size={17} fill="currentColor" /> START RUN <kbd>↵</kbd></Button><div className="control-hint"><span><ArrowLeft size={13} /><ArrowRight size={13} /></span> switch lanes <span><ArrowUp size={13} /><ArrowDown size={13} /></span> jump / slide</div></div>}
            {phase === "paused" && <div className="status-overlay"><Pause size={28} /><p>RUN PAUSED</p><Button variant="hero" onClick={() => setPhase("running")}><Play size={15} fill="currentColor" /> RESUME</Button></div>}
            {phase === "gameover" && <div className="status-overlay game-over"><p className="game-over-kicker">SERVICE INTERRUPTED</p><h2>KEEP<br /><span>RUNNING.</span></h2><div className="final-stats"><div><span>Score</span><b>{hud.score.toLocaleString()}</b></div><div><span>Distance</span><b>{hud.distance}m</b></div><div><span>Coins</span><b>{hud.coins}</b></div></div><Button variant="hero" size="lg" onClick={startRun}><RotateCcw size={16} /> RUN IT BACK <kbd>↵</kbd></Button></div>}
            <div className="toast-note"><i /> {toast}</div>
          </div>
          <div className="touch-controls"><Button variant="control" size="icon" aria-label="Move left" onClick={() => move(-1)}><ArrowLeft size={20} /></Button><Button variant="control" size="icon" aria-label="Jump" onClick={jump}><ArrowUp size={20} /></Button><Button variant="control" size="icon" aria-label="Slide" onClick={slide}><ArrowDown size={20} /></Button><Button variant="control" size="icon" aria-label="Move right" onClick={() => move(1)}><ArrowRight size={20} /></Button></div>
        </div>

        <aside className="intel-panel">
          <div className="panel-heading"><div><span className="eyebrow">RUN INTEL</span><h2>Tonight’s<br /><span>objectives.</span></h2></div><div className="signal-bars"><i /><i /><i /><i /></div></div>
          <div className="stat-grid"><div className="stat-cell"><span><Gauge size={13} /> SPEED</span><strong>{hud.speed}.<small>0</small>x</strong><div className="meter"><i style={{ width: `${Math.min(100, hud.speed * 11)}%` }} /></div></div><div className="stat-cell"><span><Gem size={13} /> DISTANCE</span><strong>{hud.distance}<small>m</small></strong><div className="meter lime"><i style={{ width: `${Math.min(100, hud.distance / 5)}%` }} /></div></div></div>
          <div className="mission-list"><div className="section-label">DAILY MISSIONS <span>03</span></div>{missions.map((mission, index) => <div className="mission-row" key={mission.label}><div className={`mission-icon mission-${index}`}>{mission.icon}</div><div className="mission-copy"><strong>{mission.label}</strong><span>{mission.detail}</span><div className="mission-meter"><i style={{ width: `${(missionProgress[index] / mission.target) * 100}%` }} /></div></div><b>{missionProgress[index]}<small>/{mission.target}</small></b></div>)}</div>
          <div className="powerup-list"><div className="section-label">POWER RAIL <span>COLLECT IN-RUN</span></div><div className="powerup-grid"><PowerChip icon="✧" name="MAGNET" color="cyan" /><PowerChip icon="↟" name="JETPACK" color="violet" /><PowerChip icon="◇" name="SHIELD" color="lime" /><PowerChip icon="»" name="BOOST" color="coral" /></div></div>
          <div className="record-strip"><span>ALL-TIME HIGH</span><strong>{highScore.toLocaleString()}</strong><small>BEST DISTANCE {bestDistance}M</small></div>
        </aside>
      </section>
      <footer className="runner-footer"><span><i className="footer-signal" /> SYSTEMS NOMINAL</span><span>ORIGINAL GAMEPLAY · RAIL//RUSH STUDIOS</span><span>BUILD 01.09.26 <b>●</b></span></footer>
    </main>
  );
}

function PowerChip({ icon, name, color }: { icon: string; name: string; color: string }) {
  return <div className={`power-chip ${color}`}><span>{icon}</span><small>{name}</small></div>;
}

function powerLabel(power: PowerType) { return power === "boost" ? "SPEED BOOST" : power.toUpperCase(); }

type RunnerState = {
  width: number; height: number; palette: Palette; playerLane: number; targetLane: number; playerX: number; jump: number; slide: number; distance: number; coins: number; score: number; speed: number; power: PowerType | null; powerTime: number; dodged: number; spawnTimer: number; sceneryOffset: number; entities: Entity[]; particles: Particle[]; dead: boolean; flash: number;
};

function createRunnerState(): RunnerState {
  return { width: 800, height: 600, palette: defaultPalette, playerLane: 0, targetLane: 0, playerX: 0, jump: 0, slide: 0, distance: 0, coins: 0, score: 0, speed: 0.23, power: null, powerTime: 0, dodged: 0, spawnTimer: 0.9, sceneryOffset: 0, entities: [], particles: [], dead: false, flash: 0 };
}

function updateRunner(state: RunnerState, dt: number) {
  state.width = state.width || 800;
  state.height = state.height || 600;
  const boost = state.power === "boost" ? 1.48 : 1;
  const difficulty = 1 + Math.min(1.35, state.distance / 900);
  const travel = state.speed * boost * difficulty * dt;
  state.distance += travel * 82;
  state.score += travel * 115 + state.coins * 0.004;
  state.speed = Math.min(0.52, 0.23 + state.distance / 5800);
  state.sceneryOffset = (state.sceneryOffset + travel * 2.2) % 1;
  state.playerX += (state.targetLane - state.playerX) * Math.min(1, dt * 13);
  state.jump = state.jump > 0 ? state.jump + dt * 2.9 : 0;
  if (state.jump >= 2) state.jump = 0;
  state.slide = Math.max(0, state.slide - dt);
  state.powerTime = Math.max(0, state.powerTime - dt);
  if (state.powerTime === 0) state.power = null;
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) { spawnWave(state, difficulty); state.spawnTimer = Math.max(0.46, 0.96 - state.distance / 2700) + Math.random() * 0.38; }
  for (const entity of state.entities) {
    entity.z += travel;
    entity.spin += dt * (entity.type === "coin" ? 7 : 2);
    if (entity.z > 0.74 && entity.z < 1.02 && !entity.collected && Math.abs(entity.lane - state.playerLane) < 0.35) {
      if (entity.type === "coin" || isPower(entity.type)) {
        entity.collected = true;
        if (entity.type === "coin") { state.coins += 1; state.score += 25; burst(state, entity, state.palette.yellow); }
        else { state.power = entity.type; state.powerTime = entity.type === "boost" ? 5 : 7; burst(state, entity, powerColor(state.palette, entity.type)); }
        audioRefSafe(state, entity.type === "coin" ? "coin" : "power");
      }
    }
    if (entity.z > 0.83 && entity.z < 0.97 && !entity.passed && isObstacle(entity.type) && Math.abs(entity.lane - state.playerLane) < 0.35) {
      const jumping = state.jump > 0.38 && state.jump < 1.85;
      const sliding = state.slide > 0.1;
      const safe = entity.type === "barrier" ? jumping : entity.type === "tunnel" ? sliding : false;
      if (!safe && state.power !== "shield") { state.dead = true; state.flash = 1; burst(state, entity, state.palette.coral); }
      else { entity.passed = true; state.dodged += 1; state.score += 45; }
    }
    if (entity.z > 1.02 && isObstacle(entity.type) && !entity.passed) { entity.passed = true; state.dodged += 1; state.score += 25; }
  }
  state.entities = state.entities.filter((entity) => entity.z < 1.08 && !entity.collected);
  for (const particle of state.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 42 * dt; particle.life -= dt; }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.flash = Math.max(0, state.flash - dt * 3);
}

function spawnWave(state: RunnerState, difficulty: number) {
  const lane = Math.floor(Math.random() * 3) - 1;
  const roll = Math.random();
  const obstacle: ObstacleType = roll < 0.42 ? "barrier" : roll < 0.77 ? "train" : "tunnel";
  state.entities.push({ lane, z: 0, type: obstacle, spin: 0 });
  if (Math.random() < 0.82) {
    const coinLane = Math.random() < 0.58 ? lane + (Math.random() > 0.5 ? 1 : -1) : Math.floor(Math.random() * 3) - 1;
    for (let index = 0; index < 3 + Math.floor(Math.random() * 3); index++) state.entities.push({ lane: Math.max(-1, Math.min(1, coinLane)), z: -0.08 - index * 0.085, type: "coin", spin: 0 });
  }
  if (Math.random() < 0.12 + difficulty * 0.025) { const types: PowerType[] = ["magnet", "jetpack", "shield", "boost"]; state.entities.push({ lane: Math.floor(Math.random() * 3) - 1, z: -0.25, type: types[Math.floor(Math.random() * types.length)] || "shield", spin: 0 }); }
}

function isObstacle(type: Entity["type"]): type is ObstacleType { return type === "barrier" || type === "train" || type === "tunnel"; }
function isPower(type: Entity["type"]): type is PowerType { return type === "magnet" || type === "jetpack" || type === "shield" || type === "boost"; }
function powerColor(palette: Palette, type: PowerType) { return type === "magnet" ? palette.cyan : type === "jetpack" ? palette.violet : type === "shield" ? palette.lime : palette.coral; }
function audioRefSafe(state: RunnerState, kind: string) { void state; void kind; }
function burst(state: RunnerState, entity: Entity, color: string) { for (let index = 0; index < 9; index++) state.particles.push({ x: entity.lane, y: 0.86, vx: (Math.random() - 0.5) * 1.4, vy: -(Math.random() * 1.2 + 0.4), life: 0.45 + Math.random() * 0.35, color, size: 2 + Math.random() * 3 }); }

function drawScene(ctx: CanvasRenderingContext2D, state: RunnerState | null, width: number, height: number) {
  const palette = state?.palette || defaultPalette;
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height); sky.addColorStop(0, palette.void); sky.addColorStop(0.55, palette.fog); sky.addColorStop(1, palette.void); ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
  const horizon = height * 0.39; const center = width / 2; const corridor = Math.min(width * 0.72, 690);
  ctx.globalAlpha = 0.5; for (let index = 0; index < 16; index++) { const x = (index * 137 + (state?.sceneryOffset || 0) * 320) % (width + 180) - 90; ctx.fillStyle = index % 3 === 0 ? palette.coral : palette.cyan; ctx.fillRect(x, horizon - 50 + (index % 4) * 12, 2, 34); ctx.fillRect(x - 13, horizon - 50 + (index % 4) * 12, 28, 1); } ctx.globalAlpha = 1;
  ctx.fillStyle = palette.panel; ctx.beginPath(); ctx.moveTo(center - corridor * 0.22, horizon); ctx.lineTo(center + corridor * 0.22, horizon); ctx.lineTo(center + corridor * 0.56, height); ctx.lineTo(center - corridor * 0.56, height); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1; for (let index = 0; index < 13; index++) { const z = ((index / 13 + (state?.sceneryOffset || 0)) % 1); const y = horizon + Math.pow(z, 1.75) * (height - horizon + 80); const half = corridor * 0.2 + z * corridor * 0.38; ctx.globalAlpha = 0.18 + z * 0.35; ctx.beginPath(); ctx.moveTo(center - half, y); ctx.lineTo(center + half, y); ctx.stroke(); } ctx.globalAlpha = 1;
  for (const offset of [-1, 0, 1]) { const x = center + offset * corridor * 0.19; ctx.strokeStyle = palette.rail; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(center + offset * corridor * 0.05, horizon); ctx.lineTo(x, height); ctx.stroke(); ctx.strokeStyle = palette.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(center + offset * corridor * 0.08, horizon); ctx.lineTo(x + (offset * 7), height); ctx.stroke(); }
  ctx.fillStyle = palette.cyan; ctx.globalAlpha = 0.8; ctx.fillRect(center - corridor * 0.43, horizon - 2, corridor * 0.86, 3); ctx.globalAlpha = 1;
  if (state) { [...state.entities].sort((a, b) => a.z - b.z).forEach((entity) => drawEntity(ctx, entity, state, center, corridor, horizon, height)); drawPlayer(ctx, state, center, corridor, height); drawParticles(ctx, state, center, corridor, height); if (state.flash > 0) { ctx.fillStyle = palette.coral; ctx.globalAlpha = state.flash * 0.22; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1; } }
}

function laneX(center: number, corridor: number, lane: number, z: number) { return center + lane * (corridor * 0.09 + z * corridor * 0.115); }
function drawEntity(ctx: CanvasRenderingContext2D, entity: Entity, state: RunnerState, center: number, corridor: number, horizon: number, height: number) {
  if (entity.z < -0.45) return;
  const z = Math.max(0, Math.min(1, entity.z)); const y = horizon + Math.pow(z, 1.72) * (height - horizon + 80); const scale = 0.18 + z * 1.18; const x = laneX(center, corridor, entity.lane, z); const p = state.palette;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (entity.type === "coin") { ctx.rotate(entity.spin); ctx.strokeStyle = p.yellow; ctx.lineWidth = 5; ctx.fillStyle = p.yellow; ctx.beginPath(); ctx.arc(0, -14, 15, 0, Math.PI * 2); ctx.stroke(); ctx.fillText("+", -6, -7); }
  else if (isPower(entity.type)) { const color = powerColor(p, entity.type); ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillStyle = color; ctx.rotate(entity.spin * 0.4); ctx.beginPath(); ctx.moveTo(0, -31); ctx.lineTo(25, -7); ctx.lineTo(0, 18); ctx.lineTo(-25, -7); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = p.void; ctx.font = "bold 17px sans-serif"; ctx.textAlign = "center"; ctx.fillText(entity.type === "jetpack" ? "↟" : entity.type === "magnet" ? "✧" : entity.type === "shield" ? "◇" : "»", 0, -1); }
  else if (entity.type === "barrier") { ctx.fillStyle = p.coral; ctx.fillRect(-57, -35, 114, 26); ctx.fillStyle = p.yellow; ctx.fillRect(-57, -29, 114, 8); ctx.fillStyle = p.void; ctx.fillRect(-40, -13, 8, 31); ctx.fillRect(32, -13, 8, 31); ctx.fillStyle = p.coral; ctx.fillRect(-65, -42, 130, 7); }
  else if (entity.type === "tunnel") { ctx.strokeStyle = p.violet; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(0, 13, 82, Math.PI, 0); ctx.stroke(); ctx.strokeStyle = p.cyan; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 13, 73, Math.PI, 0); ctx.stroke(); ctx.fillStyle = p.void; ctx.fillRect(-69, -28, 138, 40); ctx.fillStyle = p.cyan; ctx.fillRect(-55, -24, 12, 3); ctx.fillRect(43, -24, 12, 3); }
  else { ctx.fillStyle = p.train; ctx.fillRect(-58, -85, 116, 93); ctx.fillStyle = p.yellow; ctx.fillRect(-51, -70, 102, 34); ctx.fillStyle = p.void; ctx.fillRect(-41, -64, 31, 22); ctx.fillRect(10, -64, 31, 22); ctx.fillStyle = p.coral; ctx.fillRect(-61, 0, 122, 8); ctx.fillStyle = p.ink; ctx.fillRect(-42, -7, 16, 5); ctx.fillRect(26, -7, 16, 5); }
  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: RunnerState, center: number, corridor: number, height: number) {
  const p = state.palette; const x = laneX(center, corridor, state.playerX, 1); const baseY = height - 72; const jumpArc = state.jump > 0 ? Math.sin((state.jump / 2) * Math.PI) : 0; const y = baseY - jumpArc * 116; const lean = Math.sin(performance.now() / 90) * 2; ctx.save(); ctx.translate(x, y); ctx.rotate(lean * Math.PI / 180); const crouch = state.slide > 0 ? 0.62 : 1; ctx.scale(1, crouch); ctx.shadowColor = p.cyan; ctx.shadowBlur = 16; ctx.fillStyle = p.cyan; ctx.beginPath(); ctx.arc(0, -52, 13, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = p.void; ctx.fillRect(-7, -57, 14, 5); ctx.fillStyle = p.lime; ctx.beginPath(); ctx.moveTo(-15, -36); ctx.lineTo(15, -36); ctx.lineTo(22, 10); ctx.lineTo(-22, 10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = p.coral; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-13, 9); ctx.lineTo(-23, 29); ctx.moveTo(13, 9); ctx.lineTo(24, 29); ctx.stroke(); ctx.strokeStyle = p.yellow; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-15, -26); ctx.lineTo(-31, -7); ctx.moveTo(15, -26); ctx.lineTo(31, -9); ctx.stroke(); if (state.power === "shield") { ctx.strokeStyle = p.lime; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(0, -16, 49, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, state: RunnerState, center: number, corridor: number, height: number) { for (const particle of state.particles) { const x = laneX(center, corridor, particle.x, 1) + particle.vx * 32; const y = height - 72 - particle.y * 65; ctx.globalAlpha = Math.max(0, particle.life * 1.8); ctx.fillStyle = particle.color; ctx.fillRect(x, y, particle.size, particle.size); } ctx.globalAlpha = 1; }

class AudioController {
  context: AudioContext | null = null; muted = false; timer: number | null = null;
  start() { if (this.muted) return; this.context ||= new AudioContext(); void this.context.resume(); if (!this.timer) this.timer = window.setInterval(() => this.blip([196, 247, 294, 330][Math.floor(Math.random() * 4)] || 247, 0.07), 620); }
  toggle(on: boolean) { this.muted = !on; if (!on && this.timer) { window.clearInterval(this.timer); this.timer = null; } }
  blip(frequency: number, duration: number) { if (this.muted || !this.context) return; const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); oscillator.frequency.value = frequency; oscillator.type = "square"; gain.gain.setValueAtTime(0.028, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration); oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(this.context.currentTime + duration); }
  hit() { this.blip(72, 0.32); }
}

const audioController = new AudioController();
function getAudioController() { return audioController; }
