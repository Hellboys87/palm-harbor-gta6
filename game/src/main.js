// Palm Harbor Heat — boot, game state, the fixed-step loop, saving.
// Screens: start -> play <-> paused, with busted / wasted detours.

import { TILE, PITCH, SAVE_KEY, STEP, ECON, WORLD_W, WORLD_H } from './config.js';
import { createRandom } from './random.js';
import { buildCity } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import {
  spawnTraffic, spawnParked, spawnPeds, scatterPickups, spawnPoliceCar,
  updateTrafficCar, updatePoliceCar, updatePed, updateBullets, updatePickups, addFloatText,
} from './entities.js';
import { makePlayer, updatePlayerFoot, updatePlayerCar, updateWanted, reportCrime } from './player.js';
import { createMissions, SPOTS } from './missions.js';
import { stageShot } from './shots.js';

const STATION = { x: 4 * PITCH + TILE / 2, y: 3 * PITCH + TILE / 2 };
const HOSPITAL = { x: 8 * PITCH + TILE / 2, y: 6 * PITCH + TILE / 2 };

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261119;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function buildGame(saved) {
  const rng = createRandom(seed);
  const world = buildCity(rng);
  const start = saved && Number.isFinite(saved.x)
    ? { x: saved.x, y: saved.y }
    : { x: SPOTS.club.x + 30, y: SPOTS.club.y + 70 };
  const G = {
    rng, world, time: 0, screen: shotName ? 'play' : 'start',
    cars: [], peds: [], pickups: [], bullets: [], texts: [],
    cam: { x: 0, y: 0 }, wanted: 0, lastCrimeAt: -99, busted: 0,
    loseHeat: false, threat: null, shake: 0, muzzle: 0,
    policeSpawnCd: 0, buttons: [], lastPenalty: 0, nearCar: false,
    hasSave: !!readSave(),
    player: makePlayer(start.x, start.y),
    input: createInput(canvas),
    audio: createAudio(),
    save,
    crime(kind, x, y, mult) { reportCrime(G, kind, x, y, mult); },
    spawnPolice() { spawnPoliceCar(G); },
    hurtPlayer(dmg) {
      const p = G.player;
      if (G.screen !== 'play' || p.dead) return;
      const absorbed = Math.min(p.armor, dmg * 0.6);
      p.armor -= absorbed;
      p.health -= (dmg - absorbed);
      G.audio.hurt();
      G.shake = Math.min(6, G.shake + 1.5);
      if (p.health < 0) p.health = 0; // stepWorld spots 0 health and runs the wasted flow
    },
    damageCar(car, dmg, _attacker) {
      if (car.dead) return;
      car.health -= dmg;
      if (car.health <= 0) {
        car.health = 0; car.dead = true; car.speed = 0;
        addFloatText(G, car.x, car.y - 26, 'WRECKED', '#ff6b6b');
        G.audio.crash(0.8);
        if (G.player.car === car) {
          const p = G.player;
          p.car = null;
          p.x = car.x + 26; p.y = car.y;
          G.hurtPlayer(12);
        }
      }
    },
    onBusted,
  };
  if (saved) {
    G.player.cash = saved.cash ?? G.player.cash;
    G.player.ammo = saved.ammo ?? G.player.ammo;
  }
  G.mission = createMissions(G);
  if (saved && Number.isInteger(saved.missionIndex)) {
    G.mission.index = Math.min(saved.missionIndex, 6);
    G.mission.phase = G.mission.index >= 6 ? 'allDone' : 'offer';
  }
  spawnTraffic(G, 15);
  spawnParked(G, 13);
  spawnPeds(G, 26);
  scatterPickups(G);
  updateCamera(G, 1);
  return G;

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: G.player.cash, ammo: G.player.ammo,
        missionIndex: G.mission ? G.mission.index : 0,
        x: Math.round(G.player.x), y: Math.round(G.player.y),
      }));
      G.hasSave = true;
    } catch { /* storage off: progress lasts this visit */ }
  }

  function onBusted() {
    const p = G.player;
    G.lastPenalty = Math.min(p.cash, ECON.bustedFine);
    p.cash -= G.lastPenalty;
    G.wanted = 0; G.busted = 0;
    if (p.car) { p.car.driver = false; if (p.car.kind === 'player') p.car.kind = 'parked'; p.car = null; }
    p.x = STATION.x; p.y = STATION.y + 40;
    for (const c of G.cars) if (c.kind === 'police') c.dead = true;
    for (const q of G.peds) if (q.cop) q.dead = true;
    G.screen = 'busted';
    G.audio.fail();
    status.textContent = 'Busted. The police took you in.';
    save();
  }
}

const renderer = createRenderer(canvas);
let G = buildGame(null);

/** Health hit zero during stepWorld: hospital, a bill, a clean slate. */
function doWasted() {
  const p = G.player;
  G.lastPenalty = Math.min(p.cash, ECON.wastedBill);
  p.cash -= G.lastPenalty;
  p.health = 70; p.dead = false;
  G.wanted = 0; G.busted = 0;
  if (p.car) { p.car.driver = false; if (p.car.kind === 'player') p.car.kind = 'parked'; p.car = null; }
  p.x = HOSPITAL.x; p.y = HOSPITAL.y + 40;
  for (const c of G.cars) if (c.kind === 'police') c.dead = true;
  for (const q of G.peds) if (q.cop) q.dead = true;
  G.screen = 'wasted';
  G.audio.fail();
  status.textContent = 'Wasted. You woke up in hospital.';
  G.save();
}
function updateCamera(G2, dt) {
  const { W, H } = renderer.size;
  const tx = Math.max(0, Math.min(WORLD_W - W, G2.player.x - W / 2));
  const ty = Math.max(0, Math.min(WORLD_H - H, G2.player.y - H / 2));
  const k = dt <= 0 ? 1 : Math.min(1, dt * 5);
  G2.cam.x += (tx - G2.cam.x) * k;
  G2.cam.y += (ty - G2.cam.y) * k;
}

/** One fixed simulation step. Exported for the screenshot scenes. */
function stepWorld(G2, dt) {
  G2.time += dt;
  const p = G2.player;
  if (p.car) updatePlayerCar(G2, dt); else updatePlayerFoot(G2, dt);
  if (p.health <= 0 && G2.screen === 'play') doWasted();

  for (const car of G2.cars) {
    if (car.dead) continue;
    if (car === p.car) continue;
    if (car.kind === 'traffic') updateTrafficCar(G2, car, dt);
    else if (car.kind === 'police') updatePoliceCar(G2, car, dt);
  }
  for (const ped of G2.peds) updatePed(G2, ped, dt);
  // Corpses linger 20 s, then the city quietly clears them.
  G2.peds = G2.peds.filter((q) => !q.dead || (G2.time - (q.deathT ?? G2.time)) < 20);
  updateBullets(G2, dt);
  updatePickups(G2, dt);
  G2.mission.update(dt);
  updateWanted(G2, dt);

  // Ambient respawns keep the city alive.
  if (G2.cars.filter((c) => c.kind === 'traffic' && !c.dead).length < 13) spawnTraffic(G2, 1);
  if (G2.peds.filter((q) => !q.dead && !q.cop && !q.thug).length < 20) spawnPeds(G2, 1);
  if (G2.pickups.filter((q) => q.kind !== 'package').length < 18) scatterPickups(G2);

  G2.nearCar = !p.car && G2.cars.some((c) => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 40);
  for (const t of G2.texts) { t.life -= dt; t.y -= 12 * dt; }
  G2.texts = G2.texts.filter((t) => t.life > 0);
  G2.muzzle = Math.max(0, G2.muzzle - dt);
  G2.shake = Math.max(0, G2.shake - dt * 14);
  updateCamera(G2, dt);
  const sirenNear = G2.cars.some((c) => c.kind === 'police' && !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 380);
  G2.audio.update(dt, p.car ? p.car.speed : 0, sirenNear);
}

function startNewGame() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  G = buildGame(null);
  G.screen = 'play';
  status.textContent = 'New game. Welcome to Palm Harbor.';
}

function continueGame() {
  const saved = readSave();
  if (!saved) return;
  G = buildGame(saved);
  G.screen = 'play';
  status.textContent = 'Save loaded. Back on the streets.';
}

function handleClick() {
  const input = G.input;
  if (!input.takeClick()) return;
  G.audio.unlock();
  if (G.screen !== 'start') return;
  const { x, y } = input.mouse;
  for (const b of G.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'new') startNewGame();
      if (b.id === 'continue') continueGame();
    }
  }
}

function handleKeys() {
  const input = G.input;
  if (input.tap('KeyM')) {
    G.audio.unlock();
    status.textContent = G.audio.toggleMute() ? 'Sound muted.' : 'Sound on.';
  }
  if (G.screen === 'start') {
    if (input.tap('Enter')) startNewGame();
    return;
  }
  if (G.screen === 'busted' || G.screen === 'wasted') {
    if (input.tap('Enter')) { G.screen = 'play'; G.save(); }
    return;
  }
  if (input.tap('Escape') || input.tap('KeyP')) {
    G.screen = G.screen === 'paused' ? 'play' : 'paused';
    status.textContent = G.screen === 'paused' ? 'Paused.' : 'Playing.';
  }
}

if (shotName) {
  stageShot(shotName, G, stepWorld);
  let painted = 0;
  const paint = () => {
    renderer.draw(G);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    handleClick();
    handleKeys();
    if (G.screen === 'play') {
      while (acc >= STEP) { stepWorld(G, STEP); acc -= STEP; }
    } else acc = 0;
    renderer.draw(G);
  };
  window.addEventListener('pointerdown', () => G.audio.unlock(), { once: false });
  window.addEventListener('keydown', () => G.audio.unlock(), { once: false });
  status.textContent = 'Palm Harbor Heat. Choose New Game or Continue.';
  requestAnimationFrame(frame);
}
