// Living city: traffic cars that follow the road grid, parked cars waiting
// to be borrowed, pedestrians on the sidewalks, police that hunt the
// player, pickups and bullets. Everything updates against the shared
// game state G (built in main.js) and reports crimes through G.crime().

import { TILE, PITCH, COLS, ROWS, CAR, ECON } from './config.js';
import { roadCenter, collideCircle, hitsBuilding, randomRoadPoint, randomSidewalkPoint, isWater } from './world.js';
import { range, pick, chance } from './random.js';

const CARDINALS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Lane offset for right-hand traffic given a cardinal heading. */
function laneOffset(dir) {
  // Heading east -> drive on the south lane; west -> north; south -> west; north -> east.
  if (dir === 0) return { x: 0, y: 17 };
  if (dir === Math.PI) return { x: 0, y: -17 };
  if (dir === Math.PI / 2) return { x: -17, y: 0 };
  return { x: 17, y: 0 };
}

export function makeCar(x, y, angle, color, kind) {
  return {
    x, y, angle, speed: 0, color, kind,
    health: 100, dead: false, driver: kind !== 'parked',
    dir: angle, waypoint: null, wait: 0, copSpawnCd: 0,
    w: CAR.wid, l: CAR.len, honkCd: 0,
  };
}

/** The next junction a traffic car aims for, one block away. */
function pickWaypoint(rng, car) {
  const stepX = Math.round(Math.cos(car.dir));
  const stepY = Math.round(Math.sin(car.dir));
  let nx = car.x + stepX * PITCH;
  let ny = car.y + stepY * PITCH;
  // At the map edge, turn around.
  if (nx < TILE || nx > (COLS) * PITCH + TILE || ny < TILE || ny > (ROWS) * PITCH + TILE) {
    car.dir = CARDINALS[(CARDINALS.indexOf(car.dir) + 2) % 4];
    nx = car.x + Math.round(Math.cos(car.dir)) * PITCH;
    ny = car.y + Math.round(Math.sin(car.dir)) * PITCH;
  }
  const off = laneOffset(car.dir);
  car.waypoint = { x: nx + off.x, y: ny + off.y };
}

export function spawnTraffic(G, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(G.rng);
    const dir = pick(G.rng, CARDINALS);
    const car = makeCar(p.x, p.y, dir, pick(G.rng, CAR.colors), 'traffic');
    car.dir = dir;
    pickWaypoint(G.rng, car);
    G.cars.push(car);
  }
}

export function spawnParked(G, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomRoadPoint(G.rng);
    const horizontal = chance(G.rng, 0.5);
    const car = makeCar(p.x + range(G.rng, -8, 8), p.y + (horizontal ? range(G.rng, 20, 24) * (chance(G.rng, 0.5) ? 1 : -1) : 0),
      horizontal ? 0 : Math.PI / 2, pick(G.rng, CAR.colors), 'parked');
    if (!horizontal) car.x += range(G.rng, 20, 24) * (chance(G.rng, 0.5) ? 1 : -1);
    car.driver = false;
    if (!hitsBuilding(G.world, car.x, car.y, 20)) G.cars.push(car);
  }
}

export function spawnPoliceCar(G) {
  // Enter from a road edge a few hundred units from the player.
  const p = G.player;
  const side = Math.floor(G.rng() * 4);
  let x = p.x, y = p.y;
  if (side === 0) { x = Math.max(TILE / 2, p.x - 520); y = p.y; }
  if (side === 1) { x = p.x + 520; y = p.y; }
  if (side === 2) { y = Math.max(TILE / 2, p.y - 520); x = p.x; }
  if (side === 3) { y = p.y + 520; x = p.x; }
  x = Math.min(x, roadCenter(COLS * 6));
  y = Math.min(y, roadCenter(ROWS * 6));
  const car = makeCar(x, y, Math.atan2(p.y - y, p.x - x), '#f4f6f8', 'police');
  car.health = 140;
  G.cars.push(car);
  return car;
}

export function makePed(x, y, opts = {}) {
  return {
    x, y, angle: range(Math.random, 0, Math.PI * 2), speed: 0,
    state: 'walk', target: null, health: opts.thug ? 90 : 30,
    color: opts.color || pick(Math.random, ['#ff7675', '#74b9ff', '#ffeaa7', '#55efc4', '#a29bfe', '#fab1a0', '#81ecec']),
    cop: !!opts.cop, thug: !!opts.thug, dead: false, panic: 0,
    attackCd: 0, repath: 0, radius: 10,
  };
}

export function spawnPeds(G, count) {
  for (let i = 0; i < count; i += 1) {
    const p = randomSidewalkPoint(G.rng, G.world);
    const ped = makePed(p.x, p.y, {});
    ped.target = randomSidewalkPoint(G.rng, G.world);
    G.peds.push(ped);
  }
}

export function spawnPickup(G, x, y, kind) {
  G.pickups.push({ x, y, kind, phase: range(G.rng, 0, Math.PI * 2), dead: false });
}

export function scatterPickups(G) {
  const kinds = ['cash', 'health', 'armor', 'ammo'];
  for (let i = 0; i < 26; i += 1) {
    const p = randomSidewalkPoint(G.rng, G.world);
    spawnPickup(G, p.x, p.y, pick(G.rng, kinds));
  }
}

export function addFloatText(G, x, y, text, color = '#ffe66d') {
  G.texts.push({ x, y, text, color, life: 1.1 });
}

/** Something up ahead? Returns the gap to the nearest obstacle in front. */
function obstacleAhead(G, car, lookDist) {
  const fx = car.x + Math.cos(car.angle) * lookDist;
  const fy = car.y + Math.sin(car.angle) * lookDist;
  let gap = lookDist;
  const consider = (e, r) => {
    const d = Math.hypot(e.x - fx, e.y - fy);
    if (d < r + 16) gap = Math.min(gap, Math.hypot(e.x - car.x, e.y - car.y) - r);
  };
  for (const other of G.cars) if (other !== car && !other.dead) consider(other, 24);
  if (G.player.car && G.player.car !== car) consider(G.player.car, 24);
  if (!G.player.car) consider(G.player, 14);
  for (const ped of G.peds) if (!ped.dead) consider(ped, 10);
  return gap;
}

function driveCar(G, car, dt, targetSpeed) {
  const gap = obstacleAhead(G, car, 58);
  let want = targetSpeed;
  if (gap < 26) want = 0;
  else if (gap < 58) want = targetSpeed * 0.45;
  if (car.wait > 0) { car.wait -= dt; want = 0; }
  car.speed += Math.max(-CAR.brake * dt, Math.min(CAR.accel * 0.7 * dt, want - car.speed));
  if (want === 0 && Math.abs(car.speed) < 14) car.speed = 0;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function updateTrafficCar(G, car, dt) {
  if (!car.waypoint) pickWaypoint(G.rng, car);
  const wp = car.waypoint;
  const d = Math.hypot(wp.x - car.x, wp.y - car.y);
  if (d < 30) {
    // At a junction: mostly go straight, sometimes turn.
    if (chance(G.rng, 0.42)) {
      const turn = chance(G.rng, 0.5) ? 1 : -1;
      const idx = CARDINALS.indexOf(car.dir);
      car.dir = CARDINALS[(idx + turn + 4) % 4];
    }
    pickWaypoint(G.rng, car);
  }
  const targetAngle = Math.atan2(wp.y - car.y, wp.x - car.x);
  car.angle = angleLerp(car.angle, targetAngle, dt * 3.2);
  driveCar(G, car, dt, 150);
  const pos = { x: car.x, y: car.y };
  collideCircle(G.world, pos, 15);
  car.x = pos.x; car.y = pos.y;
}

export function updatePoliceCar(G, car, dt) {
  const p = G.player;
  const target = { x: p.x, y: p.y };
  const d = dist(car, target);
  const targetAngle = Math.atan2(target.y - car.y, target.x - car.x);
  car.angle = angleLerp(car.angle, targetAngle, dt * 2.6);
  const aggression = 200 + G.wanted * 26;
  let want = d > 46 ? aggression : 40;
  // Do not plough through crowds at full tilt right next to the player.
  const gap = obstacleAhead(G, car, 46);
  if (gap < 18 && d > 60) want = Math.min(want, 60);
  car.speed += Math.max(-CAR.brake * dt, Math.min(CAR.accel * 0.85 * dt, want - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  collideCircle(G.world, pos, 15);
  car.x = pos.x; car.y = pos.y;

  // Ram contact with the player's car.
  if (p.car && !p.car.dead) {
    const cd = dist(car, p.car);
    if (cd < 34 && Math.abs(car.speed) > 60) {
      G.damageCar(p.car, 6, car);
      G.shake = Math.min(9, G.shake + 3);
      G.audio.crash(0.5);
      car.speed *= 0.55;
    }
  }
  // Foot officers pile out when they are close to an on-foot player.
  car.copSpawnCd -= dt;
  if (!p.car && d < 120 && Math.abs(car.speed) < 30 && car.copSpawnCd <= 0) {
    const foot = G.peds.filter((q) => q.cop && !q.dead).length;
    if (foot < 4) {
      const cop = makePed(car.x + range(G.rng, -16, 16), car.y + range(G.rng, -16, 16), { cop: true, color: '#2d4a7a' });
      cop.state = 'chase';
      G.peds.push(cop);
      car.copSpawnCd = 7;
    }
  }
}

export function updatePed(G, ped, dt) {
  if (ped.dead) return;
  ped.attackCd -= dt;
  ped.repath -= dt;
  const p = G.player;
  const threat = G.threat; // {x, y, t} recent danger point

  if (ped.cop) {
    ped.state = 'chase';
    const d = dist(ped, p);
    if (!p.car && d < 300) {
      ped.angle = angleLerp(ped.angle, Math.atan2(p.y - ped.y, p.x - ped.x), dt * 8);
      ped.speed = d > 26 ? 196 : 0;
    } else if (p.car) {
      ped.speed = 0; // cars handle drivers; foot cops wait for a stop
    } else {
      ped.angle = angleLerp(ped.angle, Math.atan2(p.y - ped.y, p.x - ped.x), dt * 8);
      ped.speed = d > 26 ? 196 : 0;
    }
  } else if (ped.thug) {
    const d = dist(ped, p);
    ped.state = d < 420 ? 'fight' : 'walk';
    if (ped.state === 'fight' && !p.car) {
      ped.angle = angleLerp(ped.angle, Math.atan2(p.y - ped.y, p.x - ped.x), dt * 8);
      ped.speed = d > 30 ? 178 : 0;
      if (d <= 32 && ped.attackCd <= 0) {
        ped.attackCd = 0.9;
        G.hurtPlayer(7);
        G.audio.melee();
      }
    } else if (ped.state === 'fight' && p.car) {
      ped.speed = 0;
      if (d < 30) { ped.health -= 60 * dt; if (ped.health <= 0) killPed(G, ped, true); }
    } else ped.speed = 40;
  } else {
    // Civilian: flee fresh danger, otherwise stroll between sidewalks.
    const dangerNear = threat && (G.time - threat.t) < 3 && Math.hypot(ped.x - threat.x, ped.y - threat.y) < 190;
    const fastCarNear = G.cars.some((c) => !c.dead && Math.abs(c.speed) > 190 && Math.hypot(c.x - ped.x, c.y - ped.y) < 74);
    if (dangerNear || fastCarNear) {
      ped.state = 'flee';
      const from = dangerNear ? threat : p;
      ped.angle = Math.atan2(ped.y - from.y, ped.x - from.x);
      ped.speed = 215;
      ped.panic = 1.6;
    } else if (ped.panic > 0) {
      ped.panic -= dt; ped.speed = 190;
    } else {
      ped.state = 'walk';
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 14 || ped.repath <= 0) {
        ped.target = randomSidewalkPoint(G.rng, G.world);
        ped.repath = 9;
      }
      ped.angle = angleLerp(ped.angle, Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x), dt * 5);
      ped.speed = 62;
    }
  }

  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  const pos = { x: ped.x, y: ped.y };
  collideCircle(G.world, pos, ped.radius);
  if (pos.x === ped.x && pos.y === ped.y) { /* free */ }
  ped.x = pos.x; ped.y = pos.y;
  if (isWater(ped.x, ped.y)) ped.x -= 30;
}

export function killPed(G, ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.deathT = G.time;
  ped.speed = 0;
  if (byPlayer) {
    if (ped.cop) G.crime('hitPed', ped.x, ped.y, 2);
    else if (!ped.thug) G.crime('hitPed', ped.x, ped.y, 1);
    if (chance(G.rng, 0.5)) spawnPickup(G, ped.x, ped.y, 'cash');
  }
  G.threat = { x: ped.x, y: ped.y, t: G.time };
}

export function updateBullets(G, dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || hitsBuilding(G.world, b.x, b.y, 2) || isWater(b.x, b.y)) { b.dead = true; continue; }
    if (b.fromPlayer) {
      for (const ped of G.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
          ped.health -= 55; b.dead = true;
          G.threat = { x: b.x, y: b.y, t: G.time };
          if (ped.health <= 0) killPed(G, ped, true);
          else addFloatText(G, ped.x, ped.y - 18, '-55', '#ff6b6b');
          break;
        }
      }
      if (b.dead) continue;
      for (const car of G.cars) {
        if (car.dead || car === G.player.car) continue;
        if (Math.abs(car.x - b.x) < 24 && Math.abs(car.y - b.y) < 24) {
          G.damageCar(car, 26, null); b.dead = true; break;
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => !b.dead);
}

export function updatePickups(G, dt) {
  const p = G.player;
  for (const pk of G.pickups) {
    pk.phase += dt * 3;
    if (pk.dead || pk.kind === 'package' || pk.kind === 'car') continue;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 26) {
      pk.dead = true;
      if (pk.kind === 'cash') { p.cash += ECON.cashPickup; addFloatText(G, p.x, p.y - 24, `+$${ECON.cashPickup}`); G.audio.cash(); }
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + ECON.healthPickup); addFloatText(G, p.x, p.y - 24, '+HEALTH', '#7bed9f'); G.audio.pickup(); }
      if (pk.kind === 'armor') { p.armor = Math.min(100, p.armor + ECON.armorPickup); addFloatText(G, p.x, p.y - 24, '+ARMOR', '#70a1ff'); G.audio.pickup(); }
      if (pk.kind === 'ammo') { p.ammo += ECON.ammoPickup; addFloatText(G, p.x, p.y - 24, `+${ECON.ammoPickup} AMMO`, '#ffa502'); G.audio.pickup(); }
    }
  }
  G.pickups = G.pickups.filter((pk) => !pk.dead);
}
