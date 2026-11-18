// All drawing: the sun-soaked city, cars, people, HUD, minimap, menus.
// Nothing in here changes game state; it reads G and paints one frame.

import { TILE, BLOCK_TILES, PITCH, COLS, ROWS, CITY_W, CITY_H, SAND_W, WORLD_W, WORLD_H, WANTED } from './config.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 1280, H = 800;

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
  }
  resize();
  window.addEventListener('resize', resize);

  function text(str, x, y, size, color, align = 'left', weight = 400) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function drawStar(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------- world ----------------

  function drawWorld(G) {
    const cam = G.cam;
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 1), x1 = Math.min(Math.ceil(WORLD_W / TILE), Math.ceil((cam.x + W) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / TILE) - 1), y1 = Math.min(Math.ceil(WORLD_H / TILE), Math.ceil((cam.y + H) / TILE) + 1);
    // Ocean base.
    ctx.fillStyle = '#2e86c1';
    ctx.fillRect(0, 0, W, H);
    // Land.
    ctx.fillStyle = '#d9c9a3';
    ctx.fillRect(-cam.x, -cam.y, CITY_W, WORLD_H);
    // Sand.
    ctx.fillStyle = '#f2dfa7';
    ctx.fillRect(CITY_W - cam.x, -cam.y, SAND_W, WORLD_H);
    // Water shimmer lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i += 1) {
      const wy = ((i * 397 + G.time * 22) % WORLD_H) - cam.y;
      const wx = CITY_W + SAND_W + 30 + (i % 4) * 70 - cam.x;
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 34, wy);
    }
    ctx.stroke();

    // Roads + sidewalks.
    for (let tx = x0; tx < x1; tx += 1) {
      for (let ty = y0; ty < y1; ty += 1) {
        const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
        const roadX = tx % (BLOCK_TILES + 1) === 0, roadY = ty % (BLOCK_TILES + 1) === 0;
        if (roadX || roadY) {
          ctx.fillStyle = '#45454e';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
    // Lane dashes.
    ctx.fillStyle = 'rgba(245,197,66,0.75)';
    for (let i = 0; i <= COLS; i += 1) {
      const cx = i * PITCH + TILE / 2 - cam.x;
      if (cx < -10 || cx > W + 10) continue;
      for (let y = 8 - cam.y % 48; y < H; y += 48) ctx.fillRect(cx - 2, y, 4, 24);
    }
    for (let j = 0; j <= ROWS; j += 1) {
      const cy = j * PITCH + TILE / 2 - cam.y;
      if (cy < -10 || cy > H + 10) continue;
      for (let x = 8 - cam.x % 48; x < W; x += 48) ctx.fillRect(x, cy - 2, 24, 4);
    }
    // Sidewalk aprons around each block.
    ctx.fillStyle = '#e8e0cc';
    for (let bx = 0; bx < COLS; bx += 1) {
      for (let by = 0; by < ROWS; by += 1) {
        const px = bx * PITCH + TILE - cam.x, py = by * PITCH + TILE - cam.y;
        if (px + BLOCK_TILES * TILE < 0 || py + BLOCK_TILES * TILE < 0 || px > W || py > H) continue;
        ctx.fillRect(px, py, BLOCK_TILES * TILE, BLOCK_TILES * TILE);
        ctx.fillStyle = '#ddd2b8';
        ctx.fillRect(px + 12, py + 12, BLOCK_TILES * TILE - 24, BLOCK_TILES * TILE - 24);
        ctx.fillStyle = '#e8e0cc';
      }
    }

    // Buildings with cheap drop shadows.
    for (const b of G.world.buildings) {
      const px = b.x - cam.x, py = b.y - cam.y;
      if (px + b.w < -20 || py + b.h < -20 || px > W + 20 || py > H + 20) continue;
      ctx.fillStyle = 'rgba(60,40,20,0.28)';
      ctx.fillRect(px + 9, py + 11, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(px, py, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(px + 6, py + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const cols = Math.max(1, Math.floor(b.w / 26)), rowsN = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i += 1) for (let j = 0; j < rowsN; j += 1) {
        if ((i * 7 + j * 13 + b.floors) % 3 === 0) ctx.fillRect(px + 11 + i * 26, py + 11 + j * 26, 9, 9);
      }
    }
    // Props.
    for (const pr of G.world.props) {
      const px = pr.x - cam.x, py = pr.y - cam.y;
      if (px < -20 || py < -20 || px > W + 20 || py > H + 20) continue;
      if (pr.kind === 'hydrant') { ctx.fillStyle = '#d63031'; ctx.fillRect(px - 3, py - 5, 6, 10); }
      else if (pr.kind === 'bin') { ctx.fillStyle = '#636e72'; ctx.fillRect(px - 5, py - 5, 10, 10); }
      else { // umbrella
        ctx.fillStyle = '#e84393';
        ctx.beginPath(); ctx.moveTo(px - 13, py); ctx.lineTo(px + 13, py); ctx.lineTo(px, py - 13); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(px - 1, py, 2, 10);
      }
    }
    // Palm trees: trunk + fronds.
    for (const t of G.world.trees) {
      const px = t.x - cam.x, py = t.y - cam.y;
      if (px < -30 || py < -30 || px > W + 30 || py > H + 30) continue;
      ctx.fillStyle = 'rgba(60,40,20,0.25)';
      ctx.beginPath(); ctx.ellipse(px + 5, py + 6, 13 * t.s, 6 * t.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 3, py - 8, px + 6, py - 13 * t.s); ctx.stroke();
      ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + t.s;
        ctx.beginPath();
        ctx.moveTo(px + 6, py - 13 * t.s);
        ctx.quadraticCurveTo(px + 6 + Math.cos(a) * 10 * t.s, py - 13 * t.s + Math.sin(a) * 5 * t.s - 3,
          px + 6 + Math.cos(a) * 17 * t.s, py - 13 * t.s + Math.sin(a) * 9 * t.s);
        ctx.stroke();
      }
    }
    drawMarker(G);
    drawPickups(G);
  }

  function drawMarker(G) {
    const m = G.mission && G.mission.marker();
    if (!m || G.screen !== 'play') return;
    const px = m.x - G.cam.x, py = m.y - G.cam.y + Math.sin(G.time * 3) * 5;
    ctx.fillStyle = m.color;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(px - 13, py - 90, 26, 96);
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(px, py - 96, 15, 0, Math.PI * 2); ctx.fill();
    text(m.label, px, py - 90, 15, '#222', 'center', 700);
  }

  function drawPickups(G) {
    const icons = { cash: ['#2ecc71', '$'], health: ['#e74c3c', '+'], armor: ['#3498db', 'A'], ammo: ['#f39c12', '≡'], package: ['#f5c542', '▣'] };
    for (const pk of G.pickups) {
      const px = pk.x - G.cam.x, py = pk.y - G.cam.y + Math.sin(pk.phase) * 3;
      if (px < -20 || py < -20 || px > W + 20 || py > H + 20) continue;
      const [color, glyph] = icons[pk.kind] || icons.cash;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      text(glyph, px, py + 5, 13, '#fff', 'center', 700);
    }
  }

  function drawCar(G, car) {
    const px = car.x - G.cam.x, py = car.y - G.cam.y;
    if (px < -60 || py < -60 || px > W + 60 || py > H + 60) return;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(40,30,20,0.3)';
    roundRect(-car.l / 2 + 3, -car.w / 2 + 4, car.l, car.w, 6); ctx.fill();
    // Body.
    ctx.fillStyle = car.dead ? '#555' : car.color;
    roundRect(-car.l / 2, -car.w / 2, car.l, car.w, 6); ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#2d4a7a';
      ctx.fillRect(-6, -car.w / 2, 13, car.w);
      // Light bar flashes red / blue.
      ctx.fillStyle = Math.floor(G.time * 6) % 2 ? '#ff3838' : '#3867ff';
      ctx.fillRect(-4, -6, 8, 12);
    }
    // Cabin + windshield.
    ctx.fillStyle = 'rgba(30,40,55,0.85)';
    roundRect(-8, -car.w / 2 + 3, 17, car.w - 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(160,210,240,0.8)';
    ctx.fillRect(8, -car.w / 2 + 4, 3, car.w - 8);
    // Headlights.
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(car.l / 2 - 2, -car.w / 2 + 2, 3, 5);
    ctx.fillRect(car.l / 2 - 2, car.w / 2 - 7, 3, 5);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(-car.l / 2 - 1, -car.w / 2 + 2, 3, 5);
    ctx.fillRect(-car.l / 2 - 1, car.w / 2 - 7, 3, 5);
    // Damage smoke.
    if (!car.dead && car.health < 35) {
      ctx.fillStyle = 'rgba(80,80,80,0.5)';
      ctx.beginPath(); ctx.arc(car.l / 2, 0, 5 + Math.sin(G.time * 9) * 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (car.dead) {
      text('✕', px, py + 5, 16, '#ff3838', 'center', 700);
    }
    // Health pip for the chase target.
    if (car.kind === 'target' && !car.dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px - 22, py - 34, 44, 6);
      ctx.fillStyle = '#ff5252'; ctx.fillRect(px - 21, py - 33, 42 * Math.max(0, car.health / 90), 4);
    }
  }

  function drawPed(G, ped) {
    const px = ped.x - G.cam.x, py = ped.y - G.cam.y;
    if (px < -30 || py < -30 || px > W + 30 || py > H + 30) return;
    if (ped.dead) {
      ctx.save(); ctx.translate(px, py); ctx.rotate(ped.angle + 1.2);
      ctx.fillStyle = 'rgba(120,40,40,0.75)';
      roundRect(-11, -5, 22, 10, 5); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(40,30,20,0.25)';
    ctx.beginPath(); ctx.ellipse(px + 2, py + 4, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c99a';
    ctx.beginPath(); ctx.arc(px, py, 4.6, 0, Math.PI * 2); ctx.fill();
    if (ped.cop) { ctx.fillStyle = '#2d4a7a'; ctx.beginPath(); ctx.arc(px, py, 5.4, Math.PI, Math.PI * 2); ctx.fill(); }
    if (ped.state === 'flee') text('!', px, py - 15, 14, '#e74c3c', 'center', 700);
    if (ped.thug) { ctx.fillStyle = '#8e44ad'; ctx.fillRect(px - 8, py - 20, 16, 4); }
  }

  function drawPlayer(G) {
    const p = G.player;
    if (p.car) return;
    const px = p.x - G.cam.x, py = p.y - G.cam.y;
    ctx.fillStyle = 'rgba(40,30,20,0.3)';
    ctx.beginPath(); ctx.ellipse(px + 2, py + 5, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Gun arm.
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(p.angle) * 17, py + Math.sin(p.angle) * 17); ctx.stroke();
    if (G.muzzle > 0) {
      ctx.fillStyle = '#ffd32a';
      ctx.beginPath(); ctx.arc(px + Math.cos(p.angle) * 21, py + Math.sin(p.angle) * 21, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff9f43';
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c99a';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(px, py, 5.6, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
  }

  // ---------------- HUD ----------------

  function drawMinimap(G) {
    const mw = 188, mh = 158, mx = W - mw - 14, my = 64;
    ctx.fillStyle = 'rgba(18,24,32,0.78)';
    roundRect(mx - 4, my - 4, mw + 8, mh + 8, 8); ctx.fill();
    const sx = mw / WORLD_W, sy = mh / WORLD_H;
    ctx.fillStyle = '#3f6212';
    ctx.fillRect(mx, my, CITY_W * sx, mh);
    ctx.fillStyle = '#f2dfa7';
    ctx.fillRect(mx + CITY_W * sx, my, SAND_W * sx, mh);
    ctx.fillStyle = '#2e86c1';
    ctx.fillRect(mx + (CITY_W + SAND_W) * sx, my, (WORLD_W - CITY_W - SAND_W) * sx, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i += 1) { const x = mx + (i * PITCH + TILE / 2) * sx; ctx.moveTo(x, my); ctx.lineTo(x, my + mh); }
    for (let j = 0; j <= ROWS; j += 1) { const y = my + (j * PITCH + TILE / 2) * sy; ctx.moveTo(mx, y); ctx.lineTo(mx + mw, y); }
    ctx.stroke();
    // Police blips flash.
    if (Math.floor(G.time * 3) % 2 === 0) {
      ctx.fillStyle = '#ff3838';
      for (const c of G.cars) if (c.kind === 'police' && !c.dead) ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 4, 4);
      for (const q of G.peds) if (q.cop && !q.dead) ctx.fillRect(mx + q.x * sx - 2, my + q.y * sy - 2, 4, 4);
    }
    // Mission marker.
    const m = G.mission && G.mission.marker();
    if (m) {
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(mx + m.x * sx, my + m.y * sy, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    // Player arrow.
    const p = G.player;
    const px = mx + p.x * sx, py = my + p.y * sy;
    ctx.save(); ctx.translate(px, py); ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawHUD(G) {
    const p = G.player;
    // Health / armor bars.
    ctx.fillStyle = 'rgba(18,24,32,0.72)';
    roundRect(12, 12, 232, 64, 8); ctx.fill();
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(20, 22, 180, 13);
    ctx.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(20, 22, 180 * Math.max(0, p.health / 100), 13);
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(20, 41, 180, 9);
    ctx.fillStyle = '#5aa2ff'; ctx.fillRect(20, 41, 180 * Math.max(0, p.armor / 100), 9);
    text('♥', 226, 35, 15, '#ff6b81', 'center', 700);
    text(`$${p.cash}`, 20, 70, 17, '#7bed9f', 'left', 700);
    text(p.car ? '🚗 driving' : `🔫 pistol · ${p.ammo}`, 108, 70, 14, '#dfe6ee');
    if (G.audio.muted) text('MUTED (M)', 190, 70, 11, '#ffa502');
    // Wanted stars, drawn as polygons (the ★ glyph is unreliable in some fonts).
    const stars = G.wanted <= 0 ? 0 : Math.min(WANTED.max, Math.max(1, Math.floor(G.wanted + 0.001)));
    ctx.fillStyle = 'rgba(18,24,32,0.72)';
    roundRect(W - 200, 12, 188, 40, 8); ctx.fill();
    for (let i = 0; i < WANTED.max; i += 1) {
      drawStar(W - 168 + i * 34, 32, 13, i < stars ? '#f5c542' : 'rgba(255,255,255,0.22)');
    }
    if (G.loseHeat && stars) text('losing the heat…', W - 106, 60 + 152, 11, '#aeb9c6', 'center');
    drawMinimap(G);
    // Objective banner.
    const obj = G.mission ? G.mission.objectiveText : '';
    if (obj) {
      ctx.font = `600 15px ${FONT}`;
      const w = Math.min(W - 480, ctx.measureText(obj).width + 34);
      ctx.fillStyle = 'rgba(18,24,32,0.8)';
      roundRect((W - w) / 2, 12, w, 34, 8); ctx.fill();
      text(obj, W / 2, 35, 15, '#ffe9a8', 'center', 600);
    }
    // Dialogue box.
    const dlg = G.mission && G.mission.dialogue[0];
    if (dlg) {
      ctx.fillStyle = 'rgba(12,16,22,0.88)';
      roundRect(W / 2 - 330, H - 108, 660, 76, 10); ctx.fill();
      ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 1.5;
      roundRect(W / 2 - 330, H - 108, 660, 76, 10); ctx.stroke();
      text(dlg.speaker, W / 2 - 312, H - 80, 14, '#f5c542', 'left', 700);
      text(dlg.text, W / 2 - 312, H - 52, 16, '#f2f5f8');
    }
    // Busted meter.
    if (G.busted > 0.02) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W / 2 - 130, 120, 260, 20);
      ctx.fillStyle = '#ff3838'; ctx.fillRect(W / 2 - 128, 122, 256 * G.busted, 16);
      text('BUSTED?', W / 2, 112, 15, '#ff6b6b', 'center', 700);
    }
    // Context hint.
    if (!p.car && G.nearCar) text('Press E to enter car', p.x - G.cam.x, p.y - G.cam.y - 30, 14, '#fff', 'center', 700);
    if (p.car) text('E exit · Space handbrake', 14, H - 14, 13, 'rgba(255,255,255,0.75)');
    else text('WASD move · Shift sprint · E car · F melee · Click shoot · Esc pause', 14, H - 14, 13, 'rgba(255,255,255,0.75)');
  }

  // ---------------- screens ----------------

  function button(G, id, label, x, y, w, h, primary) {
    ctx.fillStyle = primary ? '#f5c542' : 'rgba(30,38,48,0.92)';
    roundRect(x, y, w, h, 9); ctx.fill();
    ctx.strokeStyle = '#f5c542'; ctx.lineWidth = primary ? 0 : 1.5; ctx.stroke();
    text(label, x + w / 2, y + h / 2 + 7, 19, primary ? '#22252a' : '#f2f5f8', 'center', 700);
    G.buttons.push({ id, x, y, w, h });
  }

  function drawStart(G) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f7b267'); grad.addColorStop(0.55, '#e76f51'); grad.addColorStop(1, '#264653');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // Skyline silhouette + palms.
    ctx.fillStyle = 'rgba(38,70,83,0.85)';
    let x = 0;
    for (let i = 0; x < W; i += 1) {
      const bw = 60 + ((i * 53) % 70), bh = 90 + ((i * 97) % 150);
      ctx.fillRect(x, H * 0.62 - bh, bw, bh + H * 0.38);
      x += bw + 14;
    }
    ctx.fillStyle = 'rgba(20,40,50,0.9)';
    ctx.fillRect(0, H * 0.62, W, H * 0.38);
    text('PALM HARBOR', W / 2, H * 0.24, 74, '#fff7e0', 'center', 800);
    text('H E A T', W / 2, H * 0.24 + 62, 40, '#f5c542', 'center', 800);
    text('Rico Vega just stepped off the bus with $120 and a borrowed name.', W / 2, H * 0.42, 18, '#fff2d9', 'center');
    text('The Marisol family runs Palm Harbor — drive for them, earn, and try not to get busted.', W / 2, H * 0.42 + 26, 18, '#fff2d9', 'center');
    text('WASD drive / walk · E enter car · F melee · Mouse aim, click shoot · Shift sprint · Esc pause · M mute', W / 2, H * 0.52, 15, '#ffe9a8', 'center');
    G.buttons = [];
    button(G, 'new', 'NEW GAME', W / 2 - 220, H * 0.60, 200, 52, true);
    const hasSave = !!G.hasSave;
    button(G, 'continue', hasSave ? 'CONTINUE' : 'CONTINUE (no save)', W / 2 + 20, H * 0.60, 220, 52, false);
    text('An all-original open-world crime game · runs offline · progress saves in your browser', W / 2, H * 0.60 + 92, 13, 'rgba(255,255,255,0.8)', 'center');
  }

  function drawOverlay(G, title, lines, color) {
    ctx.fillStyle = 'rgba(10,12,16,0.72)';
    ctx.fillRect(0, 0, W, H);
    text(title, W / 2, H * 0.38, 62, color, 'center', 800);
    lines.forEach((line, i) => text(line, W / 2, H * 0.38 + 52 + i * 28, 19, '#e8edf2', 'center'));
    text('Press Enter to continue', W / 2, H * 0.38 + 52 + lines.length * 28 + 26, 17, '#f5c542', 'center', 700);
  }

  function draw(G) {
    G.buttons = G.screen === 'start' ? G.buttons : [];
    if (G.screen === 'start') { drawStart(G); return; }
    ctx.save();
    if (G.shake > 0.2) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    drawWorld(G);
    for (const ped of G.peds) drawPed(G, ped);
    for (const car of G.cars) drawCar(G, car);
    drawPlayer(G);
    // Bullets.
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const b of G.bullets) {
      ctx.moveTo(b.x - G.cam.x, b.y - G.cam.y);
      ctx.lineTo(b.x - G.cam.x - b.vx * 0.012, b.y - G.cam.y - b.vy * 0.012);
    }
    ctx.stroke();
    // Floating texts.
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life);
      text(t.text, t.x - G.cam.x, t.y - G.cam.y - (1.1 - t.life) * 26, 14, t.color, 'center', 700);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawHUD(G);
    if (G.screen === 'paused') drawOverlay(G, 'PAUSED', ['The city waits. Rico does not.'], '#f5c542');
    if (G.screen === 'busted') drawOverlay(G, 'BUSTED', ['Palm Harbor PD cuffed Rico on the sidewalk.', `Bail and fines cost $${G.lastPenalty}.`, 'The Marisols posted bail — this time.'], '#ff6b6b');
    if (G.screen === 'wasted') drawOverlay(G, 'WASTED', ['Rico woke up at Palm Harbor General.', `The hospital bill was $${G.lastPenalty}.`, 'The family still needs a driver. Get back out there.'], '#ff6b6b');
  }

  return { draw, resize, get size() { return { W, H }; } };
}
