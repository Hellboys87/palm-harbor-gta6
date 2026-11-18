// The player: Rico Vega, fresh off the bus in Palm Harbor. Handles
// on-foot movement, driving, entering and stealing cars, melee and
// pistol combat, and the wanted / busted systems that answer back.

import { PLAYER, CAR, WANTED, TILE } from './config.js';
import { collideCircle, lineOfSight } from './world.js';
import { addFloatText, killPed } from './entities.js';

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0, radius: PLAYER.radius,
    health: PLAYER.maxHealth, armor: 0, cash: PLAYER.startCash,
    ammo: PLAYER.startAmmo, weapon: 'pistol', car: null,
    fireCd: 0, meleeCd: 0, dead: false,
  };
}

export function addWanted(G, amount) {
  G.wanted = Math.min(WANTED.max, G.wanted + amount);
  if (amount > 0) G.lastCrimeAt = G.time;
}

/** Crime report: amount scales the wanted gain; witnesses matter. */
export function reportCrime(G, kind, x, y, mult = 1) {
  const gain = (WANTED[kind] || 0.3) * mult;
  let seen = false;
  for (const ped of G.peds) {
    if (!ped.dead && Math.hypot(ped.x - x, ped.y - y) < 210 && lineOfSight(G.world, ped.x, ped.y, x, y)) { seen = true; break; }
  }
  const copNear = G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - x, c.y - y) < 320);
  if (kind === 'steal') {
    // Stealing is quiet if nobody is watching; hot if a cop sees it.
    addWanted(G, seen || copNear ? gain + WANTED.stealSeenBonus * 0.5 : gain * 0.35);
  } else if (seen || copNear || kind === 'hitPed' || kind === 'shoot') {
    addWanted(G, gain);
  } else {
    addWanted(G, gain * 0.4);
  }
  G.threat = { x, y, t: G.time };
}

function nearestCar(G, maxDist) {
  let best = null, bestD = maxDist;
  for (const car of G.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - G.player.x, car.y - G.player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function tryEnterExit(G) {
  const p = G.player;
  if (p.car) {
    // Step out on the left side of the car.
    const side = p.car.angle - Math.PI / 2;
    p.x = p.car.x + Math.cos(side) * 26;
    p.y = p.car.y + Math.sin(side) * 26;
    const pos = { x: p.x, y: p.y };
    collideCircle(G.world, pos, p.radius);
    p.x = pos.x; p.y = pos.y;
    if (p.car.kind === 'player') p.car.kind = 'parked';
    p.car.driver = false;
    p.car = null;
    G.audio.enter();
    return;
  }
  const car = nearestCar(G, 40);
  if (!car) return;
  const wasParked = car.kind === 'parked';
  const hadDriver = car.driver && car.kind === 'traffic';
  car.driver = true;
  if (car.kind !== 'police') car.kind = 'player';
  p.car = car;
  p.x = car.x; p.y = car.y;
  G.audio.enter();
  if (wasParked || hadDriver) {
    reportCrime(G, 'steal', car.x, car.y);
    addFloatText(G, car.x, car.y - 30, hadDriver ? 'CARJACKED!' : 'STOLEN', '#ff9f43');
  }
  if (G.mission) G.mission.onEnterCar(G, car);
}

export function updatePlayerFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const ax = input.axes();
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? PLAYER.sprint : PLAYER.walk;
  const len = Math.hypot(ax.x, ax.y);
  if (len > 0) {
    const nx = ax.x / len, ny = ax.y / len;
    p.angle = Math.atan2(ny, nx);
    p.x += nx * speed * dt;
    p.y += ny * speed * dt;
    p.speed = speed;
  } else p.speed = 0;
  const pos = { x: p.x, y: p.y };
  collideCircle(G.world, pos, p.radius);
  p.x = pos.x; p.y = pos.y;

  if (input.tap('KeyE')) tryEnterExit(G);

  // Melee: F key or a click very close by swings instead of shooting.
  p.meleeCd -= dt;
  if ((input.tap('KeyF') || (input.mouse.clicked && mouseNearPlayer(G))) && p.meleeCd <= 0) {
    p.meleeCd = 0.38;
    G.audio.melee();
    let hit = false;
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (Math.hypot(ped.x - p.x, ped.y - p.y) < PLAYER.meleeRange) {
        ped.health -= PLAYER.meleeDamage;
        hit = true;
        addFloatText(G, ped.x, ped.y - 18, 'WHAM', '#feca57');
        if (ped.health <= 0) killPed(G, ped, true);
      }
    }
    if (hit) reportCrime(G, 'melee', p.x, p.y);
  }

  // Pistol: click to shoot toward the mouse.
  p.fireCd -= dt;
  if (input.mouse.down && !mouseNearPlayer(G) && p.fireCd <= 0) {
    if (p.ammo > 0) {
      p.fireCd = 0.24;
      p.ammo -= 1;
      const aim = Math.atan2((input.mouse.y + G.cam.y) - p.y, (input.mouse.x + G.cam.x) - p.x);
      p.angle = aim;
      G.bullets.push({
        x: p.x + Math.cos(aim) * 16, y: p.y + Math.sin(aim) * 16,
        vx: Math.cos(aim) * 780, vy: Math.sin(aim) * 780,
        life: 0.55, fromPlayer: true, dead: false,
      });
      G.muzzle = 0.05;
      G.audio.shoot();
      reportCrime(G, 'shoot', p.x, p.y);
      G.shake = Math.min(4, G.shake + 0.7);
    } else if (input.takeClick()) {
      addFloatText(G, p.x, p.y - 26, 'NO AMMO', '#ff6b6b');
      p.fireCd = 0.3;
    }
  }
}

function mouseNearPlayer(G) {
  const wx = G.input.mouse.x + G.cam.x;
  const wy = G.input.mouse.y + G.cam.y;
  return Math.hypot(wx - G.player.x, wy - G.player.y) < 40;
}

export function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  const input = G.input;
  const fwd = input.down('KeyW') || input.down('ArrowUp');
  const back = input.down('KeyS') || input.down('ArrowDown');
  const left = input.down('KeyA') || input.down('ArrowLeft');
  const right = input.down('KeyD') || input.down('ArrowRight');

  if (fwd) car.speed += CAR.accel * dt;
  else if (back) car.speed -= (car.speed > 4 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed -= car.speed * 0.55 * dt; // engine drag
  if (input.down('Space')) car.speed -= car.speed * 2.4 * dt; // handbrake
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  if (Math.abs(car.speed) > 4) {
    car.angle += steer * CAR.turn * dt * Math.min(1, Math.abs(car.speed) / 120) * Math.sign(car.speed);
  }
  const oldX = car.x, oldY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  collideCircle(G.world, pos, 15);
  if (Math.hypot(pos.x - car.x, pos.y - car.y) > 0.5 && Math.abs(car.speed) > 90) {
    G.shake = Math.min(10, G.shake + Math.abs(car.speed) / 40);
    G.audio.crash(Math.min(1, Math.abs(car.speed) / 300));
    G.damageCar(car, Math.abs(car.speed) * 0.03, null);
    car.speed *= -0.25;
  } else car.speed = car.speed; // keep
  car.x = pos.x; car.y = pos.y;
  void oldX; void oldY;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  p.speed = Math.abs(car.speed);

  // Running over pedestrians is very bad for your wanted level.
  for (const ped of G.peds) {
    if (ped.dead || ped.cop) {
      if (!ped.dead && ped.cop && Math.hypot(ped.x - car.x, ped.y - car.y) < 24 && Math.abs(car.speed) > 50) {
        killPed(G, ped, true);
      }
      continue;
    }
    if (Math.hypot(ped.x - car.x, ped.y - car.y) < 22 && Math.abs(car.speed) > 46) {
      killPed(G, ped, true);
      G.audio.crash(0.4);
      G.shake = Math.min(8, G.shake + 2);
    }
  }
  // Bumping other cars.
  for (const other of G.cars) {
    if (other === car || other.dead) continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d < 36 && Math.abs(car.speed) > 55) {
      G.damageCar(other, Math.abs(car.speed) * 0.06, car);
      reportCrime(G, 'hitCar', car.x, car.y);
      G.shake = Math.min(9, G.shake + 2.5);
      G.audio.crash(0.6);
      other.speed = car.speed * 0.4;
      car.speed *= 0.55;
    }
  }

  if (input.tap('KeyE')) tryEnterExit(G);
  void TILE;
}

/** Wanted decay, police spawning and the busted meter. */
export function updateWanted(G, dt) {
  const p = G.player;
  // Decay only when no cop can see the player and no fresh crime happened.
  const copSees = G.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 300
    && lineOfSight(G.world, c.x, c.y, p.x, p.y));
  const footSees = G.peds.some((q) => q.cop && !q.dead && Math.hypot(q.x - p.x, q.y - p.y) < 200);
  G.loseHeat = !copSees && !footSees && (G.time - G.lastCrimeAt) > WANTED.decayDelay;
  if (G.loseHeat && G.wanted > 0) G.wanted = Math.max(0, G.wanted - WANTED.decay * dt);
  if (G.wanted < 0.02) G.wanted = 0;

  const stars = G.wanted <= 0 ? 0 : Math.min(WANTED.max, Math.max(1, Math.floor(G.wanted + 0.001)));
  const wantPolice = Math.floor(stars * WANTED.policePerStar);
  const police = G.cars.filter((c) => c.kind === 'police' && !c.dead);
  G.policeSpawnCd -= dt;
  if (police.length < wantPolice && G.policeSpawnCd <= 0 && G.screen === 'play') {
    G.spawnPolice();
    G.policeSpawnCd = 2.2;
  }
  if (G.wanted === 0) {
    for (const c of police) c.dead = true; // they give up and leave the world
    for (const q of G.peds) if (q.cop) q.dead = true;
  }

  // BUSTED: a cop right next to a slow, on-foot player fills the meter.
  let adjacent = false;
  if (!p.car && p.speed < 90 && G.wanted > 0) {
    for (const q of G.peds) {
      if (q.cop && !q.dead && Math.hypot(q.x - p.x, q.y - p.y) < 40) adjacent = true;
    }
    for (const c of police) {
      if (Math.hypot(c.x - p.x, c.y - p.y) < 52 && Math.abs(c.speed) < 42) adjacent = true;
    }
  }
  if (adjacent) {
    G.busted = Math.min(1, G.busted + WANTED.bustedFill * dt);
    if (G.busted >= 1) G.onBusted();
  } else {
    G.busted = Math.max(0, G.busted - WANTED.bustedDrain * dt);
  }
}
