const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  score: document.getElementById("score"),
  level: document.getElementById("level"),
  health: document.getElementById("health"),
  best: document.getElementById("best"),
};

const W = canvas.width;
const H = canvas.height;
const TILE = 32;
const keys = new Set();
const bestKey = "pixel-ruins-best";

const palette = {
  bg: "#08111f",
  floor: "#162235",
  wall: "#24344f",
  wallTop: "#314568",
  accent: "#7df9ff",
  relic: "#ffd166",
  relicGlow: "rgba(255, 209, 102, 0.35)",
  danger: "#ff6b6b",
  heal: "#85ff9e",
  text: "#f6f7fb",
};

const heroSprite = [
  "...11...",
  "..1331..",
  ".133331.",
  ".144441.",
  ".155551.",
  "..5665..",
  ".66..66.",
  "2......2",
];

const slimeSprite = [
  "........",
  ".333333.",
  "33333333",
  "33444333",
  "33333333",
  "35533553",
  "5......5",
  ".5....5.",
];

const relicSprite = [
  "...6....",
  "..676...",
  ".67776..",
  "6677776.",
  ".67776..",
  "..676...",
  "...6....",
  "........",
];

const colors = {
  1: "#f8d6b3",
  2: "#7df9ff",
  3: "#68d391",
  4: "#0f172a",
  5: "#456b89",
  6: "#ffd166",
  7: "#fff2b3",
};

const state = {
  running: true,
  level: 1,
  score: 0,
  best: Number(localStorage.getItem(bestKey) || 0),
  hitFlash: 0,
  message: "",
  messageTimer: 0,
  player: {
    x: 96,
    y: 96,
    w: 28,
    h: 28,
    speed: 170,
    health: 5,
    invuln: 0,
    dash: 0,
    dashCooldown: 0,
    facing: 1,
  },
  relics: [],
  enemies: [],
  particles: [],
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnParticles(x, y, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    state.particles.push({
      x,
      y,
      vx: rand(-80, 80),
      vy: rand(-120, 50),
      life: rand(0.35, 0.8),
      color,
      size: rand(2, 5),
    });
  }
}

function randomPoint() {
  return {
    x: rand(2 * TILE, W - 3 * TILE),
    y: rand(2 * TILE, H - 3 * TILE),
  };
}

function farEnoughFromPlayer(point) {
  const dx = point.x - state.player.x;
  const dy = point.y - state.player.y;
  return Math.hypot(dx, dy) > 160;
}

function setMessage(text, duration = 2) {
  state.message = text;
  state.messageTimer = duration;
}

function populateLevel() {
  state.relics = [];
  state.enemies = [];
  state.particles = [];

  for (let i = 0; i < 4 + state.level; i += 1) {
    const point = randomPoint();
    state.relics.push({ x: point.x, y: point.y, w: 22, h: 22, bob: rand(0, Math.PI * 2) });
  }

  for (let i = 0; i < 2 + state.level; i += 1) {
    let point = randomPoint();
    while (!farEnoughFromPlayer(point)) point = randomPoint();

    state.enemies.push({
      x: point.x,
      y: point.y,
      w: 28,
      h: 26,
      vx: (Math.random() > 0.5 ? 1 : -1) * (50 + state.level * 12),
      vy: (Math.random() > 0.5 ? 1 : -1) * (44 + state.level * 10),
      squish: rand(0, Math.PI * 2),
    });
  }
}

function resetGame() {
  state.running = true;
  state.level = 1;
  state.score = 0;
  state.hitFlash = 0;
  state.player.x = 96;
  state.player.y = 96;
  state.player.health = 5;
  state.player.invuln = 0;
  state.player.dash = 0;
  state.player.dashCooldown = 0;
  populateLevel();
  setMessage("Collect every relic.", 2.5);
  syncUI();
}

function syncUI() {
  ui.score.textContent = state.score;
  ui.level.textContent = state.level;
  ui.health.textContent = state.player.health;
  ui.best.textContent = state.best;
}

function loseGame() {
  state.running = false;
  setMessage("Ruins claimed you. Press R to try again.", 999);
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(bestKey, String(state.best));
  }
  syncUI();
}

function updatePlayer(dt) {
  const player = state.player;
  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
  if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) dy += 1;

  const magnitude = Math.hypot(dx, dy) || 1;
  dx /= magnitude;
  dy /= magnitude;

  let speed = player.speed;
  if (player.dash > 0) {
    speed = 320;
    player.dash -= dt;
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, palette.accent, 1);
  }

  if (player.dashCooldown > 0) player.dashCooldown -= dt;
  if (player.invuln > 0) player.invuln -= dt;

  player.x = clamp(player.x + dx * speed * dt, TILE, W - TILE - player.w);
  player.y = clamp(player.y + dy * speed * dt, TILE, H - TILE - player.h);

  if (dx !== 0) player.facing = dx > 0 ? 1 : -1;
}

function tryDash() {
  if (!state.running) return;
  const player = state.player;
  if (player.dashCooldown > 0 || player.dash > 0) return;
  player.dash = 0.14;
  player.dashCooldown = 1.2;
  spawnParticles(player.x + player.w / 2, player.y + player.h / 2, palette.accent, 16);
}

function updateEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.squish += dt * 8;

    if (enemy.x <= TILE || enemy.x + enemy.w >= W - TILE) enemy.vx *= -1;
    if (enemy.y <= TILE || enemy.y + enemy.h >= H - TILE) enemy.vy *= -1;

    if (intersects(enemy, state.player) && state.player.invuln <= 0) {
      state.player.health -= 1;
      state.player.invuln = 1.2;
      state.hitFlash = 0.2;
      setMessage("Ouch. Keep moving.", 1.2);
      spawnParticles(state.player.x + 14, state.player.y + 14, palette.danger, 18);
      if (state.player.health <= 0) {
        loseGame();
        return;
      }
      syncUI();
    }
  }
}

function updateRelics(dt) {
  for (let i = state.relics.length - 1; i >= 0; i -= 1) {
    const relic = state.relics[i];
    relic.bob += dt * 3;
    if (intersects(relic, state.player)) {
      state.relics.splice(i, 1);
      state.score += 1;
      setMessage("Relic secured.", 1.1);
      spawnParticles(relic.x + relic.w / 2, relic.y + relic.h / 2, palette.relic, 20);
      syncUI();
    }
  }

  if (state.running && state.relics.length === 0) {
    state.level += 1;
    state.player.health = Math.min(6, state.player.health + 1);
    setMessage("Wave cleared. The ruins awaken...", 2.2);
    syncUI();
    populateLevel();
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 140 * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function drawPixelSprite(sprite, x, y, scale = 4, flip = false, wobble = 0) {
  ctx.save();
  ctx.translate(x + (flip ? sprite[0].length * scale : 0), y + wobble);
  ctx.scale(flip ? -1 : 1, 1);
  for (let row = 0; row < sprite.length; row += 1) {
    for (let col = 0; col < sprite[row].length; col += 1) {
      const code = sprite[row][col];
      if (code === ".") continue;
      ctx.fillStyle = colors[code];
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  ctx.restore();
}

function drawArena() {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < H; y += TILE) {
    for (let x = 0; x < W; x += TILE) {
      const border = x === 0 || y === 0 || x >= W - TILE || y >= H - TILE;
      ctx.fillStyle = border ? palette.wall : palette.floor;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = border ? palette.wallTop : "rgba(255,255,255,0.03)";
      ctx.fillRect(x, y, TILE, 4);

      if (!border && (x / TILE + y / TILE) % 5 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.025)";
        ctx.fillRect(x + 3, y + 18, 8, 2);
        ctx.fillRect(x + 14, y + 10, 11, 2);
      }
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const torchX = TILE + i * 110;
    ctx.fillStyle = "rgba(125,249,255,0.08)";
    ctx.fillRect(torchX, 14, 14, 14);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(torchX + 4, 18, 6, 6);
  }

  const columns = [
    [224, 176],
    [704, 176],
    [224, 432],
    [704, 432],
    [464, 304],
  ];
  for (const [x, y] of columns) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x + 4, y + 8, 28, 28);
    ctx.fillStyle = "#415474";
    ctx.fillRect(x, y, 28, 28);
    ctx.fillStyle = "#607699";
    ctx.fillRect(x, y, 28, 5);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + 5, y + 9, 7, 7);
  }
}


function drawRelics() {
  for (const relic of state.relics) {
    const bob = Math.sin(relic.bob) * 3;
    ctx.fillStyle = palette.relicGlow;
    ctx.beginPath();
    ctx.arc(relic.x + 11, relic.y + 11 + bob, 18, 0, Math.PI * 2);
    ctx.fill();
    drawPixelSprite(relicSprite, relic.x - 5, relic.y - 5 + bob, 4);
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    const wobble = Math.sin(enemy.squish) * 2;
    drawPixelSprite(slimeSprite, enemy.x - 2, enemy.y - 4, 4, enemy.vx < 0, wobble);
  }
}

function drawPlayer() {
  const player = state.player;
  if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
  const wobble = player.dash > 0 ? -2 : Math.sin(performance.now() / 120) * 1.5;
  drawPixelSprite(heroSprite, player.x - 2, player.y - 4, 4, player.facing < 0, wobble);
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.fillStyle = "rgba(5, 8, 15, 0.56)";
  ctx.fillRect(20, 18, 268, 58);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(20, 18, 268, 58);

  ctx.fillStyle = palette.text;
  ctx.font = "bold 16px Trebuchet MS";
  ctx.fillText(`Wave ${state.level}`, 34, 42);
  ctx.fillText(`Health ${state.player.health}`, 130, 42);
  ctx.fillText(`Relics ${state.score}`, 34, 62);
  ctx.fillText(`Dash ${state.player.dashCooldown > 0 ? state.player.dashCooldown.toFixed(1) + "s" : "ready"}`, 130, 62);

  if (state.messageTimer > 0) {
    ctx.fillStyle = "rgba(5, 8, 15, 0.45)";
    ctx.fillRect(W - 270, 18, 250, 28);
    ctx.fillStyle = palette.accent;
    ctx.font = "15px Trebuchet MS";
    ctx.fillText(state.message, W - 255, 37);
  }
}

function drawGameOver() {
  if (state.running) return;
  ctx.fillStyle = "rgba(4, 6, 11, 0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = palette.text;
  ctx.textAlign = "center";
  ctx.font = "bold 48px Trebuchet MS";
  ctx.fillText("Game Over", W / 2, H / 2 - 18);
  ctx.font = "22px Trebuchet MS";
  ctx.fillText(`You recovered ${state.score} relics`, W / 2, H / 2 + 24);
  ctx.fillText("Press R to restart", W / 2, H / 2 + 62);
  ctx.textAlign = "left";
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (state.running) {
    updatePlayer(dt);
    updateEnemies(dt);
    updateRelics(dt);
  }
  updateParticles(dt);
  state.hitFlash = Math.max(0, state.hitFlash - dt);
  state.messageTimer = Math.max(0, state.messageTimer - dt);

  drawArena();
  drawRelics();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawHud();

  if (state.hitFlash > 0) {
    ctx.fillStyle = `rgba(255, 107, 107, ${state.hitFlash})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawGameOver();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  keys.add(key);
  if (event.key === " ") tryDash();
  if (key === "r" && !state.running) resetGame();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});

resetGame();
ui.best.textContent = state.best;
requestAnimationFrame(loop);
