// Deterministic screenshot scenes behind ?shot=<name>&seed=1. Each one
// builds a real game state and runs the actual simulation forward with a
// scripted input stub, so what the camera captures is the game itself —
// HUD, minimap, traffic, police and all — never a mock-up.

import { TILE, PITCH } from './config.js';
import { SPOTS } from './missions.js';
import { spawnPoliceCar, makePed } from './entities.js';
import { randomSidewalkPoint } from './world.js';

/** An input stand-in: holds the given keys down, never taps, mouse parked. */
function stubInput(heldKeys, mouse = { x: 760, y: 360 }) {
  const held = new Set(heldKeys);
  return {
    mouse: { x: mouse.x, y: mouse.y, down: false, clicked: false },
    down: (code) => held.has(code),
    tap: () => false,
    anyTap: () => false,
    clearTaps: () => {},
    takeClick: () => false,
    axes() {
      return {
        x: (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
        y: (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0),
      };
    },
  };
}

function runSteps(G, stepWorld, n) {
  for (let i = 0; i < n; i += 1) stepWorld(G, 1 / 60);
}

function stageChase(G, stepWorld) {
  const p = G.player;
  // Rico is mid-delivery for the Marisols, three stars hot.
  G.mission.index = 1;
  G.mission.phase = 'active';
  G.mission.step = 1;
  G.mission.say([['Tomas', 'Rico, half the precinct is behind you — lose them AFTER the drop!']]);
  p.cash = 640; p.health = 82; p.armor = 30; p.ammo = 18;

  const roadY = 4 * PITCH + TILE / 2;
  const car = G.cars.find((c) => c.kind === 'traffic') || G.cars[0];
  car.kind = 'player'; car.driver = true;
  car.x = 3 * PITCH + 120; car.y = roadY + 17; car.angle = 0; car.dir = 0; car.speed = 305;
  car.color = '#e74c3c';
  p.car = car; p.x = car.x; p.y = car.y;
  G.wanted = 3.2;
  G.lastCrimeAt = G.time;

  for (let i = 0; i < 3; i += 1) {
    const cop = spawnPoliceCar(G);
    cop.x = car.x - 170 - i * 120;
    cop.y = roadY + (i % 2 ? -14 : 16);
    cop.angle = 0; cop.speed = 285;
  }
  G.cam.x = p.x - 640; G.cam.y = p.y - 400;
  G.input = stubInput(['KeyW']);
  runSteps(G, stepWorld, 46);
  G.wanted = Math.max(G.wanted, 3.05); // keep the third star lit for the cover
}

function stageCity(G, stepWorld) {
  const p = G.player;
  // A busy downtown crossing at lunch hour.
  const cx = 5 * PITCH + TILE / 2, cy = 4 * PITCH + TILE / 2;
  p.x = cx + 26; p.y = cy + 44; p.angle = -0.6;
  p.cash = 275; p.health = 100; p.armor = 15; p.ammo = 30;
  for (let i = 0; i < 7; i += 1) {
    const spot = randomSidewalkPoint(G.rng, G.world);
    const ped = G.peds[i % G.peds.length];
    if (ped) { ped.x = cx + (spot.x % 90) - 45 + (i * 23) % 60; ped.y = cy + (i * 37) % 90 - 40; ped.dead = false; }
  }
  for (let i = 0; i < 5; i += 1) {
    const ped = makePed(cx - 120 + i * 55, cy + 70 - (i % 3) * 46, {});
    ped.target = randomSidewalkPoint(G.rng, G.world);
    G.peds.push(ped);
  }
  // Lunch-hour traffic flowing through the crossing itself.
  const traffic = G.cars.filter((c) => c.kind === 'traffic');
  const lanes = [
    { x: cx - 300, y: cy + 17, dir: 0 },
    { x: cx + 250, y: cy - 17, dir: Math.PI },
    { x: cx - 17, y: cy - 300, dir: Math.PI / 2 },
    { x: cx + 17, y: cy + 260, dir: -Math.PI / 2 },
  ];
  lanes.forEach((lane, i) => {
    const car = traffic[i % traffic.length];
    if (!car) return;
    car.x = lane.x; car.y = lane.y;
    car.dir = lane.dir; car.angle = lane.dir;
    car.waypoint = null; car.speed = 120;
  });
  G.cam.x = p.x - 640; G.cam.y = p.y - 400;
  G.input = stubInput([]);
  runSteps(G, stepWorld, 80);
}

function stageMission(G, stepWorld) {
  const p = G.player;
  // Beachside Business: Rico faces the Coral Kings on South Beach.
  G.mission.index = 4;
  G.mission.phase = 'offer';
  G.mission.start();
  p.x = SPOTS.rival.x - 86; p.y = SPOTS.rival.y + 8;
  p.angle = 0.15;
  p.cash = 2140; p.health = 76; p.armor = 20; p.ammo = 22;
  G.wanted = 1.1;
  G.cam.x = p.x - 560; G.cam.y = p.y - 400;
  G.input = stubInput([]);
  runSteps(G, stepWorld, 34);
  // Re-show the mission briefing line for the capture.
  if (!G.mission.dialogue.length) {
    G.mission.say([['Elena Marisol', 'The Coral Kings are selling on OUR beach now. Three of them.']]);
  }
}

export function stageShot(name, G, stepWorld) {
  G.screen = 'play';
  if (name === 'chase') stageChase(G, stepWorld);
  else if (name === 'city') stageCity(G, stepWorld);
  else if (name === 'mission') stageMission(G, stepWorld);
  else { G.screen = 'start'; return; }
  G.screen = 'play';
}
