// Palm Harbor Heat — tuning constants. Every number that shapes how the
// city feels lives here: sizes, speeds, wanted pressure, prices.
export const TILE = 64;               // world units per city tile
export const BLOCK_TILES = 5;         // building tiles per block side
export const PITCH = (BLOCK_TILES + 1) * TILE; // block + one road tile
export const COLS = 12;               // blocks across
export const ROWS = 10;               // blocks down
export const CITY_W = COLS * PITCH + TILE;
export const CITY_H = ROWS * PITCH + TILE;
export const SAND_W = 170;            // beach sand strip east of the city
export const WATER_W = 340;           // ocean beyond the sand
export const WORLD_W = CITY_W + SAND_W + WATER_W;
export const WORLD_H = CITY_H;

export const PLAYER = {
  radius: 11, walk: 152, sprint: 248,
  maxHealth: 100, maxArmor: 100, startCash: 120, startAmmo: 30,
  meleeRange: 34, meleeDamage: 45,
};

export const CAR = {
  accel: 300, brake: 460, maxSpeed: 345, maxReverse: 115,
  turn: 2.5, len: 44, wid: 22,
  colors: ['#e74c3c', '#3498db', '#f5c542', '#2ecc71', '#9b59b6',
           '#e67e22', '#ecf0f1', '#1abc9c', '#fd79a8', '#95a5a6'],
};

export const WANTED = {
  max: 5,
  steal: 1, hitCar: 0.4, hitPed: 1, shoot: 0.45, melee: 0.6,
  decay: 0.05, decayDelay: 6, policePerStar: 1.7,
  bustedFill: 1.25, bustedDrain: 0.85,
};

export const ECON = {
  bustedFine: 150, wastedBill: 200, cashPickup: 25,
  ammoPickup: 12, healthPickup: 40, armorPickup: 50,
};

export const SAVE_KEY = 'palm-harbor-heat-save-v1';
export const MUTE_KEY = 'palm-harbor-heat-muted-v1';
export const STEP = 1 / 60;
