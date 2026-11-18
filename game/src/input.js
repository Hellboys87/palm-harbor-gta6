// Keyboard + mouse input. Held keys live in a Set; one-shot presses go to
// a second Set the game drains each frame, so a tap between frames is
// never lost and never double-counted.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (e) => {
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); mouse.down = false; });

  canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('pointerdown', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    mouse.down = true; mouse.clicked = true;
  });
  window.addEventListener('pointerup', () => { mouse.down = false; });

  return {
    mouse,
    down: (code) => held.has(code),
    /** Drain and return whether a one-shot press happened. */
    tap(code) { const hit = pressed.has(code); pressed.delete(code); return hit; },
    anyTap: () => pressed.size > 0,
    clearTaps: () => pressed.clear(),
    /** Movement axes from WASD / arrows: {x, y} each in -1..1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
      return { x, y };
    },
    takeClick() { const c = mouse.clicked; mouse.clicked = false; return c; },
  };
}
