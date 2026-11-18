// Story missions for the Marisol family. Rico Vega runs errands for
// matriarch Elena Marisol and her son Tomas: pickups, deliveries, a
// chase, a beach fight and one last escape. Each mission is a small
// state machine; between missions the gold M marker waits at the
// Marisol Social Club and free-roam is fully open.

import { TILE, PITCH, CITY_W, WORLD_H } from './config.js';
import { collideCircle } from './world.js';
import { makeCar, makePed, spawnPickup, addFloatText } from './entities.js';

export const SPOTS = {
  club: { x: 2 * PITCH + TILE / 2, y: 1 * PITCH + TILE / 2, name: 'Marisol Social Club' },
  beach: { x: CITY_W + 84, y: Math.floor(WORLD_H / 2), name: 'Palm Harbor Beach' },
  warehouse: { x: 1 * PITCH + TILE / 2, y: 8 * PITCH + TILE / 2, name: 'Old Cannery Warehouse' },
  garage: { x: 6 * PITCH + TILE / 2, y: 5 * PITCH + TILE / 2, name: 'Tomas\'s Chop Garage' },
  rival: { x: CITY_W + 84, y: 950, name: 'South Beach' },
  hideout: { x: 10 * PITCH + TILE / 2, y: TILE / 2, name: 'North Palms Hideout' },
};

export const MISSION_DEFS = [
  {
    id: 'first-wheels', title: 'First Wheels', reward: 150,
    intro: [
      ['Elena Marisol', 'So you are the new driver Tomas keeps praising.'],
      ['Rico', 'I drive, I deliver, I do not ask questions.'],
      ['Elena Marisol', 'Good. Walk to the club door, meet Tomas, and we begin.'],
    ],
    objective: 'Meet Tomas at the Marisol Social Club',
  },
  {
    id: 'package-run', title: 'Package Run', reward: 300,
    intro: [
      ['Tomas', 'A courier dropped a package on the beach. Swimmers everywhere.'],
      ['Tomas', 'Pick it up, bring it to the Old Cannery. No police attention, yeah?'],
    ],
    objective: 'Pick up the package on the beach',
  },
  {
    id: 'debt', title: 'Debt Collection', reward: 450,
    intro: [
      ['Elena Marisol', 'A gambler named Ferris owes us. He is running in a blue coupe.'],
      ['Elena Marisol', 'Stop his car. However you like. Bring me his keys.'],
    ],
    objective: 'Chase down Ferris and disable his car',
  },
  {
    id: 'hot-delivery', title: 'Hot Delivery', reward: 600,
    intro: [
      ['Tomas', 'That silver sedan by the club? Very hot. Very missed by its owner.'],
      ['Tomas', 'Get it to my garage before the paint is even dry. Go!'],
    ],
    objective: 'Steal the marked sedan and deliver it to the garage',
  },
  {
    id: 'beachside', title: 'Beachside Business', reward: 800,
    intro: [
      ['Elena Marisol', 'The Coral Kings are selling on OUR beach now. Three of them.'],
      ['Rico', 'Consider the beach cleaned, senora.'],
    ],
    objective: 'Deal with the three Coral Kings on South Beach',
  },
  {
    id: 'final-run', title: 'The Final Run', reward: 1500,
    intro: [
      ['Elena Marisol', 'One last run, Rico. The police will be watching the club.'],
      ['Elena Marisol', 'Reach the North Palms hideout, then lose the heat. Family forever.'],
    ],
    objective: 'Reach the North Palms hideout',
  },
];

export function createMissions(G) {
  const M = {
    index: 0,              // next mission to offer
    phase: 'offer',        // offer | active | allDone
    step: 0,
    targetCar: null,
    thugs: [],
    timer: 0,
    dialogue: [],
    dialogueT: 0,

    get current() { return MISSION_DEFS[M.index] || null; },
    get objectiveText() {
      if (M.phase === 'allDone') return 'Free roam — Palm Harbor is yours. The Marisols remember you.';
      if (M.phase === 'offer') return `Go to the gold M — Marisol Social Club (${MISSION_DEFS[M.index].title} next)`;
      const def = M.current;
      if (def.id === 'package-run' && M.step === 1) return 'Deliver the package to the Old Cannery Warehouse';
      if (def.id === 'final-run' && M.step === 1) return 'Lose the police heat (stay out of sight)';
      return def.objective;
    },
    marker() {
      if (M.phase === 'offer') return { ...SPOTS.club, color: '#f5c542', label: 'M' };
      if (M.phase !== 'active') return null;
      const def = M.current;
      switch (def.id) {
        case 'first-wheels': return { ...SPOTS.club, color: '#f5c542', label: 'M' };
        case 'package-run': return M.step === 0 ? { ...SPOTS.beach, color: '#4fc3f7', label: 'P' } : { ...SPOTS.warehouse, color: '#f5c542', label: 'D' };
        case 'debt': return M.targetCar && !M.targetCar.dead ? { x: M.targetCar.x, y: M.targetCar.y, color: '#ff5252', label: '!' } : null;
        case 'hot-delivery': return M.step === 0
          ? (M.targetCar ? { x: M.targetCar.x, y: M.targetCar.y, color: '#4fc3f7', label: 'C' } : null)
          : { ...SPOTS.garage, color: '#f5c542', label: 'D' };
        case 'beachside': return { ...SPOTS.rival, color: '#ff5252', label: '!' };
        case 'final-run': return M.step === 0 ? { ...SPOTS.hideout, color: '#f5c542', label: 'H' } : null;
        default: return null;
      }
    },

    say(lines) { M.dialogue = lines.map(([speaker, text]) => ({ speaker, text })); M.dialogueT = 0; },

    start() {
      const def = M.current;
      if (!def) { M.phase = 'allDone'; return; }
      M.phase = 'active';
      M.step = 0;
      M.say(def.intro);
      if (def.id === 'package-run') {
        spawnPickup(G, SPOTS.beach.x, SPOTS.beach.y, 'package');
      }
      if (def.id === 'debt') {
        const car = makeCar(SPOTS.garage.x + 260, SPOTS.garage.y, 0, '#3d6db5', 'target');
        car.health = 90; car.driver = true;
        G.cars.push(car);
        M.targetCar = car;
      }
      if (def.id === 'hot-delivery') {
        const car = makeCar(SPOTS.club.x + 90, SPOTS.club.y + 44, 0, '#c0c6cc', 'parked');
        car.driver = false; car.missionCar = true;
        G.cars.push(car);
        M.targetCar = car;
      }
      if (def.id === 'beachside') {
        M.thugs = [];
        for (let i = 0; i < 3; i += 1) {
          const thug = makePed(SPOTS.rival.x - 20 + i * 26, SPOTS.rival.y + (i % 2) * 34 - 12, { thug: true, color: '#8e44ad' });
          G.peds.push(thug);
          M.thugs.push(thug);
        }
      }
      if (def.id === 'final-run') {
        G.wanted = Math.max(G.wanted, 3);
        G.lastCrimeAt = G.time;
      }
      G.save();
    },

    complete() {
      const def = M.current;
      G.player.cash += def.reward;
      addFloatText(G, G.player.x, G.player.y - 34, `MISSION COMPLETE +$${def.reward}`, '#7bed9f');
      M.say([['Elena Marisol', `Well done, Rico. $${def.reward} — the family takes care of its own.`]]);
      G.audio.sting();
      M.index += 1;
      M.phase = M.index >= MISSION_DEFS.length ? 'allDone' : 'offer';
      M.targetCar = null;
      M.thugs = [];
      G.save();
    },

    onEnterCar(G2, car) {
      if (M.phase !== 'active') return;
      const def = M.current;
      if (def.id === 'hot-delivery' && M.step === 0 && car === M.targetCar) {
        M.step = 1;
        M.say([['Tomas', 'That is the one! Garage. Now. And try not to scratch it.']]);
        G2.wanted = Math.max(G2.wanted, 1.2);
      }
    },

    update(dt) {
      // Dialogue ticker.
      if (M.dialogue.length) {
        M.dialogueT += dt;
        if (M.dialogueT > 3.6) { M.dialogue.shift(); M.dialogueT = 0; }
      }
      const p = G.player;
      if (M.phase === 'offer') {
        if (Math.hypot(p.x - SPOTS.club.x, p.y - SPOTS.club.y) < 46) M.start();
        return;
      }
      if (M.phase !== 'active') return;
      const def = M.current;
      const near = (spot, r) => Math.hypot(p.x - spot.x, p.y - spot.y) < r;

      if (def.id === 'first-wheels') {
        if (near(SPOTS.club, 46)) M.complete();
      } else if (def.id === 'package-run') {
        if (M.step === 0) {
          const pk = G.pickups.find((q) => q.kind === 'package' && !q.dead);
          if (pk && Math.hypot(p.x - pk.x, p.y - pk.y) < 30) {
            pk.dead = true;
            M.step = 1;
            M.say([['Rico', 'Got it. Heavy little thing...']]);
            G.audio.pickup();
          }
        } else if (near(SPOTS.warehouse, 56)) M.complete();
      } else if (def.id === 'debt') {
        const car = M.targetCar;
        if (car) {
          updateTargetCar(G, car, dt);
          if ((car.dead || car.health <= 0) && Math.hypot(p.x - car.x, p.y - car.y) < 60) {
            M.say([['Ferris', 'Okay! Okay! Tell Elena the keys are in the ignition!']]);
            M.complete();
          }
        }
      } else if (def.id === 'hot-delivery') {
        if (M.step === 1 && p.car === M.targetCar && near(SPOTS.garage, 62)) {
          M.targetCar.kind = 'parked';
          M.complete();
        }
      } else if (def.id === 'beachside') {
        if (M.thugs.length && M.thugs.every((t) => t.dead)) M.complete();
      } else if (def.id === 'final-run') {
        if (M.step === 0 && near(SPOTS.hideout, 62)) {
          M.step = 1;
          M.say([['Rico', 'Made it. Now to disappear for a while...']]);
        } else if (M.step === 1 && G.wanted <= 0) M.complete();
      }
    },
  };
  return M;
}

/** Ferris flees: steer away from the player, snap to roads when close. */
function updateTargetCar(G, car, dt) {
  if (car.dead || car.health <= 0 || G.player.car === car) { car.speed = 0; return; }
  const p = G.player;
  const away = Math.atan2(car.y - p.y, car.x - p.x);
  let d = (away - car.angle) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, d));
  const dP = Math.hypot(p.x - car.x, p.y - car.y);
  const want = dP < 380 ? 205 : 90;
  car.speed += Math.max(-300 * dt, Math.min(240 * dt, want - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  collideCircle(G.world, pos, 15);
  car.x = pos.x; car.y = pos.y;
}
