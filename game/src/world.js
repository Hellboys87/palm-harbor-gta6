// City generation and collision. Palm Harbor is a procedural grid: road
// tiles ring every block, each block holds 1-4 buildings with a sidewalk
// apron, palm trees and props dress the streets, and the east edge of the
// map falls away into beach sand and ocean water.

import { TILE, BLOCK_TILES, PITCH, COLS, ROWS, CITY_W, CITY_H, SAND_W, WORLD_W, WORLD_H } from './config.js';
import { range, pick, chance } from './random.js';

export { WORLD_W, WORLD_H };

const BUILDING_COLORS = ['#f7e8c9', '#f2c9a4', '#e8b4b8', '#bfe3dd', '#f9f3d9',
  '#d9c7ec', '#ffe0b2', '#c8e6c9', '#f8bbd0', '#fff9c4', '#d7ccc8', '#b2dfdb'];
const ROOF_COLORS = ['#c96f4a', '#a85751', '#8d6e63', '#78909c', '#b26a4c', '#6d8ea0'];

/** Tile column/row containing a world point. */
export function tileAt(x, y) { return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }; }

/** Roads are the one-tile strips between blocks (and around the edge). */
export function isRoad(x, y) {
  if (x < 0 || y < 0 || x >= CITY_W || y >= CITY_H) return false;
  const { tx, ty } = tileAt(x, y);
  return tx % (BLOCK_TILES + 1) === 0 || ty % (BLOCK_TILES + 1) === 0;
}

export function isWater(x, y) { return x >= CITY_W + SAND_W; }
export function isSand(x, y) { return x >= CITY_W && x < CITY_W + SAND_W; }

/** Centre line of the road strip whose tile index (multiple of 6) is given. */
export function roadCenter(index) { return index * TILE + TILE / 2; }

/** Nearest road-centre coordinate on one axis, for snapping AI cars to lanes. */
export function nearestRoadCenter(v) {
  const step = PITCH;
  const k = Math.round((v - TILE / 2) / step);
  return TILE / 2 + Math.max(0, k) * step;
}

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const props = [];
  for (let bx = 0; bx < COLS; bx += 1) {
    for (let by = 0; by < ROWS; by += 1) {
      const ox = bx * PITCH + TILE;   // block interior origin (inside the roads)
      const oy = by * PITCH + TILE;
      const inner = BLOCK_TILES * TILE;
      // One big tower or a 2x2 cluster of smaller buildings.
      if (chance(rng, 0.4)) {
        const m = range(rng, 26, 44);
        buildings.push({
          x: ox + m, y: oy + m, w: inner - m * 2, h: inner - m * 2,
          color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS),
          floors: 4 + Math.floor(rng() * 6),
        });
      } else {
        const gap = 18;
        const w = (inner - gap * 3) / 2;
        for (let i = 0; i < 2; i += 1) {
          for (let j = 0; j < 2; j += 1) {
            if (chance(rng, 0.15)) continue;
            buildings.push({
              x: ox + gap + i * (w + gap), y: oy + gap + j * (w + gap), w, h: w,
              color: pick(rng, BUILDING_COLORS), roof: pick(rng, ROOF_COLORS),
              floors: 1 + Math.floor(rng() * 3),
            });
          }
        }
      }
      // Palms along the sidewalk corners of the block.
      const corners = [[ox + 8, oy + 8], [ox + inner - 8, oy + 8], [ox + 8, oy + inner - 8], [ox + inner - 8, oy + inner - 8]];
      for (const [tx, ty] of corners) {
        if (chance(rng, 0.55)) trees.push({ x: tx + range(rng, -4, 4), y: ty + range(rng, -4, 4), s: range(rng, 0.8, 1.25) });
      }
      if (chance(rng, 0.5)) props.push({ x: ox + range(rng, 14, inner - 14), y: oy + 6, kind: 'hydrant' });
      if (chance(rng, 0.4)) props.push({ x: ox + 6, y: oy + range(rng, 14, inner - 14), kind: 'bin' });
    }
  }
  // Beach palms and umbrellas on the sand.
  for (let i = 0; i < 26; i += 1) {
    trees.push({ x: CITY_W + range(rng, 18, SAND_W - 24), y: range(rng, 20, WORLD_H - 20), s: range(rng, 0.9, 1.4) });
  }
  for (let i = 0; i < 14; i += 1) {
    props.push({ x: CITY_W + range(rng, 30, SAND_W - 10), y: range(rng, 30, WORLD_H - 30), kind: 'umbrella' });
  }
  return { buildings, trees, props };
}

/** Circle vs. every building and the water line; resolves by pushing out. */
export function collideCircle(world, pos, radius) {
  // Ocean is a wall: nothing wades in.
  const waterX = CITY_W + SAND_W - radius;
  if (pos.x > waterX) pos.x = waterX;
  if (pos.x < radius) pos.x = radius;
  if (pos.y < radius) pos.y = radius;
  if (pos.y > WORLD_H - radius) pos.y = WORLD_H - radius;
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= radius * radius) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.y = ny + (dy / d) * radius;
    } else {
      // Centre inside the rect: push out through the nearest face.
      const left = pos.x - b.x, right = b.x + b.w - pos.x;
      const top = pos.y - b.y, bottom = b.y + b.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.x - radius;
      else if (m === right) pos.x = b.x + b.w + radius;
      else if (m === top) pos.y = b.y - radius;
      else pos.y = b.y + b.h + radius;
    }
  }
}

/** True if the circle at (x, y) overlaps any building. */
export function hitsBuilding(world, x, y, radius) {
  for (const b of world.buildings) {
    const nx = Math.max(b.x, Math.min(x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** Line of sight between two points, blocked by buildings (sampled). */
export function lineOfSight(world, x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.floor(dist / 24));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (hitsBuilding(world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 4)) return false;
  }
  return true;
}

/** A random point on a road, used for traffic spawns. */
export function randomRoadPoint(rng) {
  const horizontal = chance(rng, 0.5);
  const strip = Math.floor(rng() * (horizontal ? ROWS + 1 : COLS + 1));
  if (horizontal) return { x: range(rng, 40, CITY_W - 40), y: roadCenter(strip * (BLOCK_TILES + 1)) };
  return { x: roadCenter(strip * (BLOCK_TILES + 1)), y: range(rng, 40, CITY_H - 40) };
}

/** A random sidewalk point: just inside a block edge, clear of buildings. */
export function randomSidewalkPoint(rng, world) {
  for (let tries = 0; tries < 24; tries += 1) {
    const bx = Math.floor(rng() * COLS), by = Math.floor(rng() * ROWS);
    const ox = bx * PITCH + TILE, oy = by * PITCH + TILE;
    const inner = BLOCK_TILES * TILE;
    const side = Math.floor(rng() * 4);
    const along = range(rng, 10, inner - 10);
    const p = [
      { x: ox + along, y: oy + 9 }, { x: ox + along, y: oy + inner - 9 },
      { x: ox + 9, y: oy + along }, { x: ox + inner - 9, y: oy + along },
    ][side];
    if (!hitsBuilding(world, p.x, p.y, 12)) return p;
  }
  return { x: TILE / 2, y: TILE / 2 };
}
