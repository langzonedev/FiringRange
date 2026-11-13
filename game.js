'use strict';

const scene = document.querySelector('#scene');
const ctx = scene.getContext('2d', { alpha: false });
const background = document.createElement('canvas');
const sky = background.getContext('2d', { alpha: false });
const byId = (id) => document.getElementById(id);
const mutedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const tau = Math.PI * 2;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const arsenal = [
  { name: 'Quartz', family: 'Sidearm', glyph: '◇', profile: 'A single straight pulse', ink: '#ffe5a8', speed: 3.7, gap: .23, pitch: 390, head: 26, shell: 20 },
  { name: 'Mica', family: 'Burst', glyph: '⋮', profile: 'Three quick pulses in a tight cluster', ink: '#a3efcc', speed: 4.6, gap: .38, pitch: 540, head: 44, shell: 27, burst: 3 },
  { name: 'Banksia', family: 'Scatter', glyph: '✳', profile: 'Five pulses in a wide fan', ink: '#ffd294', speed: 3.3, gap: .42, pitch: 230, head: 38, shell: 35, scatter: 5 },
  { name: 'Kestrel', family: 'Precision', glyph: '⊕', profile: 'A pinpoint pulse with a crisp trail', ink: '#d2f5ff', speed: 6.7, gap: .38, pitch: 690, head: 66, shell: 14 },
  { name: 'Ember', family: 'Rocket', glyph: '➶', profile: 'A slow spark with a circular splash', ink: '#ffc386', speed: 1.75, gap: .67, pitch: 170, head: 49, shell: 40, splash: 39 },
  { name: 'Saltbush', family: 'Lobber', glyph: '◠', profile: 'An arcing orb with a wide landing ripple', ink: '#e9c3ff', speed: 1.5, gap: .7, pitch: 285, head: 34, shell: 31, arc: .24, splash: 55 },
];

const setup = [
  { x: .14, y: .55, size: 21, kind: 'plate' },
  { x: .32, y: .61, size: 27, kind: 'glass' },
  { x: .45, y: .49, size: 17, kind: 'plate' },
  { x: .61, y: .60, size: 27, kind: 'plate' },
  { x: .75, y: .52, size: 18, kind: 'glass' },
  { x: .87, y: .64, size: 25, kind: 'pulse' },
  { x: .15, y: .74, size: 23, kind: 'pulse' },
  { x: .37, y: .37, size: 15, kind: 'disc', phase: 0 },
  { x: .73, y: .31, size: 13, kind: 'disc', phase: 3 },
];

const keys = new Set();
const shots = [];
const queued = [];
const particles = [];
const rings = [];
const scoreLabels = [];
let targets;
let width = 1;
let height = 1;
let scale = 1;
let selected = 0;
let score = 0;
let streak = 0;
const targetTypes = new Set();
let sound = false;
let audio;
let now = 0;
let nextLaunch = 0;
let clearResultAt = 0;
let lastFrame;
let aim = { x: .51, y: .48 };
let touch = null;
let mouse = null;
let scoped = false;
const scopeZoom = 2.4;
const attackLimit = 12;
let attack = false;
let remaining = attackLimit;
let pending = false;
let attackRecord = 0;
const bestKeys = { free: 'firing-range-best', attack: 'firing-range-attack-best' };
const records = { free: 0, attack: 0 };
try {
  for (const mode of Object.keys(bestKeys)) records[mode] = Number(localStorage.getItem(bestKeys[mode])) || 0;
} catch { /* Play remains available. */ }

function modeKey() { return attack ? 'attack' : 'free'; }

function showScore() {
  byId('score').textContent = score;
  const mode = modeKey();
  if (score > records[mode]) {
    records[mode] = score;
    try { localStorage.setItem(bestKeys[mode], score); } catch { /* Play remains available. */ }
  }
  byId('best').textContent = records[mode];
}

function setMode(enabled) {
  if (attack === enabled) return;
  attack = enabled;
  byId('free-mode').setAttribute('aria-pressed', String(!attack));
  byId('attack-mode').setAttribute('aria-pressed', String(attack));
  byId('challenge').hidden = !attack;
  byId('remaining').hidden = !attack;
  reset();
  setScope(false);
}

function updateProgress() {
  byId('variety').textContent = targetTypes.size === 4 ? 'Gallery cleared' : 'Targets '+targetTypes.size+'/4';
  byId('streak').textContent = 'Streak '+streak;
  byId('remaining').textContent = remaining+' left';
  syncLaunch();
}

function syncLaunch() {
  const button = byId('launch');
  const complete = attack && remaining === 0 && !pending;
  const waiting = !complete && (now < nextLaunch || pending);
  button.disabled = complete || (attack && waiting);
  const state = complete ? 'complete' : waiting ? 'waiting' : 'ready';
  if (button.dataset.state !== state) button.dataset.state = state;
}

function reset() {
  score = 0;
  streak = 0;
  remaining = attackLimit;
  pending = false;
  attackRecord = records.attack;
  targetTypes.clear();
  updateProgress();
  clearInput();
  shots.length = queued.length = particles.length = rings.length = scoreLabels.length = 0;
  targets = setup.map((item) => ({ ...item, hit: -20, resetAt: 0 }));
  showScore();
  byId('reset').textContent = attack ? 'Restart run' : 'Reset range';
  byId('result').textContent = '';
  nextLaunch = 0;
  clearResultAt = 0;
  syncLaunch();
}
reset();

function setScope(enabled) {
  scoped = enabled && arsenal[selected].family === 'Precision';
  byId('scope').setAttribute('aria-pressed', String(scoped));
  byId('scope').textContent = scoped ? 'Exit scope' : 'Scope';
}

function select(index) {
  selected = index;
  const model = arsenal[index];
  byId('scope').hidden = model.family !== 'Precision';
  if (byId('scope').hidden) setScope(false);
  byId('category').textContent = model.family;
  byId('model').textContent = model.name;
  byId('profile').textContent = model.profile;
  for (const [i, button] of [...byId('kit').children].entries()) {
    button.setAttribute('aria-pressed', String(i === index));
  }
}
for (const [index, model] of arsenal.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  const glyph = document.createElement('b');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = model.glyph;
  button.append(glyph, document.createTextNode(model.family));
  button.addEventListener('click', () => select(index));
  byId('kit').append(button);
}
select(0);

byId('reset').addEventListener('click', () => { reset(); setScope(false); });
byId('free-mode').addEventListener('click', () => setMode(false));
byId('attack-mode').addEventListener('click', () => setMode(true));
byId('scope').addEventListener('click', () => setScope(!scoped));
byId('sound').addEventListener('click', () => {
  sound = !sound;
  byId('sound').textContent = sound ? 'Sound on' : 'Sound off';
  byId('sound').setAttribute('aria-pressed', String(sound));
  if (sound) tone(480, .07, .04);
});

function tone(frequency, duration, volume, rise = false) {
  if (!sound) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audio ||= new Audio();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  const time = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * (rise ? 1.65 : .62), time + duration);
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(.001, time + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(time);
  oscillator.stop(time + duration);
}

function pointerAim(event) {
  const rect = scene.getBoundingClientRect();
  aim.x = clamp((event.clientX - rect.left) / rect.width, .015, .985);
  aim.y = clamp((event.clientY - rect.top) / rect.height, .06, .95);
}

function clearInput() {
  keys.clear();
  const active = touch?.id ?? null;
  touch = null;
  if (active !== null && scene.hasPointerCapture(active)) scene.releasePointerCapture(active);
}

function steer(dx, dy, sensitivity) {
  const gain = sensitivity / (scoped ? scopeZoom : 1);
  aim.x = clamp(aim.x + dx / width * gain, .015, .985);
  aim.y = clamp(aim.y + dy / height * gain, .06, .95);
}
scene.addEventListener('pointerleave', () => { mouse = null; });
scene.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  if (event.pointerType === 'mouse') {
    if (!scoped) pointerAim(event);
    launch();
    return;
  }
  touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
  scene.setPointerCapture(touch.id);
});
scene.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse') {
    if (!scoped) pointerAim(event);
    else if (mouse) steer(event.clientX - mouse.x, event.clientY - mouse.y, 1);
    mouse = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.pointerId !== touch?.id) return;
  steer(event.clientX - touch.x, event.clientY - touch.y, 1.35);
  touch.x = event.clientX;
  touch.y = event.clientY;
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  scene.addEventListener(event, (pointer) => {
    if (pointer.pointerId === touch?.id) clearInput();
  });
}
scene.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
    event.preventDefault();
    if (event.key === ' ' && !event.repeat) launch();
    else keys.add(event.key);
  }
  if (!event.repeat && event.key.toLowerCase() === 'z') setScope(!scoped);
  if (event.key === 'Escape') setScope(false);
  if (/^[1-6]$/.test(event.key)) select(Number(event.key) - 1);
});
window.addEventListener('keyup', (event) => keys.delete(event.key));
scene.addEventListener('blur', clearInput);
window.addEventListener('blur', clearInput);
byId('launch').addEventListener('click', launch);

function launch() {
  if (now < nextLaunch || (attack && (pending || remaining === 0))) return;
  if (attack) {
    remaining--;
    pending = true;
    updateProgress();
  }
  const model = arsenal[selected];
  nextLaunch = now + model.gap;
  syncLaunch();
  const count = model.scatter || model.burst || 1;
  const group = { points: 0, remaining: count, clear: false };
  const origin = muzzle();
  const from = { x: origin.x / width, y: origin.y / height };
  for (let i = 0; i < count; i++) {
    const offset = i - (count - 1) / 2;
    const spread = model.scatter ? .045 : .009;
    queued.push({
      at: now + (model.burst ? i * .075 : 0),
      group,
      model,
      from,
      x: clamp(aim.x + offset * spread, .01, .99),
      y: clamp(aim.y + Math.abs(offset) * (model.scatter ? .017 : .004), .03, .97),
    });
  }
  tone(model.pitch, model.splash ? .24 : .10, .075);
}

function position(target) {
  const x = target.x + (target.kind === 'disc' && !mutedMotion.matches ? Math.sin(now * .88 + target.phase) * .063 : 0);
  const y = target.y + (target.kind === 'disc' && !mutedMotion.matches ? Math.sin(now * 1.5 + target.phase) * .026 : 0);
  return { x: x * width, y: y * height, radius: target.size * scale };
}

function muzzle() {
  return {
    x: (.5 + (aim.x - .5) * .33) * width,
    y: (.84 + (aim.y - .48) * .10) * height,
  };
}

function pulse(x, y, colour, size) {
  rings.push({ x, y, colour, size, life: .43 });
  if (mutedMotion.matches) return;
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * tau + Math.random() * .38;
    const speed = 32 + Math.random() * 102;
    particles.push({ x, y, colour, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .27 });
  }
}

function impact(shot) {
  const x = shot.x * width;
  const y = shot.y * height;
  const splash = (shot.model.splash || 0) * scale;
  let points = 0;
  let feedback = '';
  const candidates = targets.filter((target) => target.resetAt <= now).map((target) => {
    const p = position(target);
    return { target, p, distance: Math.hypot(p.x - x, p.y - y) };
  }).filter(({ p, distance }) => distance <= p.radius + splash);
  candidates.sort((first, second) => first.distance - second.distance);
  for (const { target, p } of (splash ? candidates : candidates.slice(0, 1))) {
    const centre = target.kind === 'plate' && Math.hypot(p.x - x, p.y - p.radius * .09 - y) <= p.radius * .31;
    const value = centre ? 100 : { plate: 25, disc: 65, glass: 40, pulse: 50 }[target.kind];
    feedback ||= centre ? 'Bullseye' : { plate: 'Steel', disc: 'Flying disc', glass: 'Glass', pulse: 'Pulse pod' }[target.kind];
    const cleared = targetTypes.size === 4;
    targetTypes.add(target.kind);
    if (!cleared && targetTypes.size === 4) shot.group.clear = true;
    target.hit = now;
    target.resetAt = now + (target.kind === 'plate' ? .18 : 2);
    pulse(p.x, p.y, target.kind === 'glass' ? '#deffff' : '#ffe6a3', p.radius * 1.5);
    tone(centre ? 880 : 600, .15, .065, true);
    points += value;
  }
  if (splash) {
    const lob = Boolean(shot.model.arc);
    const size = splash * (lob ? 1.22 : 1.35);
    rings.push({ x, y, colour: shot.model.ink, size, life: lob ? .66 : .45, burst: lob ? 'orb' : 'spark' });
    tone(lob ? 185 : 116, lob ? .26 : .18, .085);
    feedback ||= lob ? 'Orb burst' : 'Rocket burst';
  } else if (!points) {
    pulse(x, y, shot.model.ink, 13 * scale);
  }
  shot.group.remaining--;
  shot.group.points += points;
  if (feedback) shot.group.feedback = feedback;
  if (points && !attack) {
    score += points;
    showScore();
  }
  if (shot.group.remaining) return;

  const hit = shot.group.points > 0;
  streak = hit ? streak + 1 : 0;
  const multiplier = attack && hit ? Math.min(streak, 3) : 1;
  const bonus = attack && shot.group.clear ? 200 : 0;
  const awarded = shot.group.points * multiplier + bonus;
  let result = hit ? shot.group.feedback + ' +' + awarded : (shot.group.feedback ? shot.group.feedback+' · Miss' : 'Miss');
  if (attack) {
    score += awarded;
    showScore();
    if (multiplier > 1) result += ' · ×'+multiplier;
    if (bonus) result += ' · Gallery bonus';
    pending = false;
    if (remaining === 0) {
      byId('reset').textContent = 'Play again';
      result = (score > attackRecord ? 'New best' : 'Run complete')+' · '+score+' points';
    }
  }
  if (hit) scoreLabels.push({ x: shot.x, y: shot.y, value: awarded, multiplier, life: .85 });
  updateProgress();
  byId('result').textContent = result;
  clearResultAt = attack && remaining === 0 ? 0 : now + 1.35;
}

function path(points, fill, context = ctx) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) context.lineTo(points[i][0], points[i][1]);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function oval(x, y, rx, ry, fill, context = ctx) {
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, tau);
  context.fillStyle = fill;
  context.fill();
}

function line(x1, y1, x2, y2, stroke, weight = 1, context = ctx) {
  context.strokeStyle = stroke;
  context.lineWidth = weight;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function landscape() {
  const random = seeded(231);
  const horizon = height * .435;
  const grade = sky.createLinearGradient(0, 0, 0, horizon * 1.35);
  grade.addColorStop(0, '#211d3b');
  grade.addColorStop(.63, '#69405c');
  grade.addColorStop(1, '#bd7963');
  sky.fillStyle = grade;
  sky.fillRect(0, 0, width, height);
  const sunX = width * .78;
  const sunY = height * .16;
  const glow = sky.createRadialGradient(sunX, sunY, 4, sunX, sunY, height * .23);
  glow.addColorStop(0, '#fca57d69');
  glow.addColorStop(1, '#fca57d00');
  sky.fillStyle = glow;
  sky.fillRect(0, 0, width, height);
  oval(sunX, sunY, height * .047, height * .047, '#ffd6a8da', sky);
  for (let i = 0; i < 12; i++) {
    const x = random() * width;
    const y = (.09 + random() * .22) * height;
    oval(x, y, (38 + random() * 100) * scale, (1.5 + random() * 4) * scale, '#f7f6d83b', sky);
  }
  for (const [index, colour] of ['#615169', '#494052', '#332d42'].entries()) {
    const ridge = [[0, height]];
    for (let i = 0; i <= 30; i++) {
      const high = Math.sin(i * .27 + index) * .043 + Math.cos(i * .63 + index) * .03;
      ridge.push([i / 30 * width, horizon + height * (high + (index - 2) * .07 + random() * .03)]);
    }
    ridge.push([width, height]);
    path(ridge, colour, sky);
  }
  for (const x of [width * .045, width * .955]) {
    const top = height * .22;
    const base = horizon + 32 * scale;
    line(x, top, x, base, '#322938', 4 * scale, sky);
    const light = sky.createRadialGradient(x, top, 1, x, top, 33 * scale);
    light.addColorStop(0, '#ffd9a5aa');
    light.addColorStop(1, '#ffd9a500');
    oval(x, top, 33 * scale, 33 * scale, light, sky);
    line(x - 8 * scale, top, x + 8 * scale, top, '#ffe5be', 3 * scale, sky);
  }
  const sand = sky.createLinearGradient(0, horizon, 0, height);
  sand.addColorStop(0, '#735359');
  sand.addColorStop(.48, '#90614e');
  sand.addColorStop(1, '#413440');
  path([[0, horizon * 1.06], [width * .5, horizon * .99], [width, horizon * 1.11], [width, height], [0, height]], sand, sky);

  for (let i = 0; i < 2700; i++) {
    const x = random() * width;
    const y = horizon * 1.08 + random() * (height - horizon * 1.08);
    const depth = (y - horizon) / (height - horizon);
    sky.fillStyle = i % 3 ? '#64533824' : '#ffe3a242';
    sky.fillRect(x, y, .7 + random() * depth * 6, .65 + depth * .8);
  }
  for (let i = 0; i < 70; i++) {
    const x = random() * width;
    const y = height * (.51 + random() * .4);
    const size = (y / height - .41) * (3 + random() * 24) * scale;
    oval(x, y, size * 1.2, size * .19, '#66543746', sky);
    if (i % 3) {
      for (let leaf = 0; leaf < 7; leaf++) {
        line(x, y, x + (random() - .5) * size * 2, y - random() * size, i % 2 ? '#79683d' : '#656841', 1.2 * scale, sky);
      }
    }
  }
  for (const side of [0, 1]) {
    const start = side ? width : 0;
    const inner = width * (side ? .74 : .26);
    const y = height * .55;
    for (const offset of [0, 10]) line(start, y + offset * scale, inner, y - 11 * scale + offset * scale, '#816d52', 2 * scale, sky);
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const x = start + (inner - start) * t;
      line(x, y - (11 * t + 10) * scale, x, y + (19 - 13 * t) * scale, '#5f553a', 3 * scale, sky);
    }
  }
  path([[width * .35, height], [width * .43, height * .59], [width * .55, height * .59], [width * .65, height]], '#e8bf811b', sky);
}

function fit() {
  const rect = scene.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  scale = clamp(Math.min(width / 850, height / 510), .64, 1.34);
  const density = Math.min(window.devicePixelRatio || 1, 2);
  scene.width = background.width = Math.round(width * density);
  scene.height = background.height = Math.round(height * density);
  ctx.setTransform(density, 0, 0, density, 0, 0);
  sky.setTransform(density, 0, 0, density, 0, 0);
  landscape();
}
new ResizeObserver(fit).observe(scene);
fit();

function drawTarget(target) {
  const { x, y, radius: r } = position(target);
  const age = now - target.hit;
  const gone = target.resetAt > now && target.kind !== 'plate';
  ctx.save();
  ctx.translate(x, y);
  if (target.kind !== 'disc') {
    oval(5 * scale, r * 2.14, r * 1.33, r * .22, '#3b33264d');
    path([[-r * .13, r * .47], [r * .17, r * .47], [r * .23, r * 1.99], [-r * .16, r * 2.1]], '#655136');
    path([[-r * .13, r * .47], [r * .01, r * .47], [r * .04, r * 2.05], [-r * .16, r * 2.1]], '#ac8861');
  }
  if (gone) {
    ctx.restore();
    return;
  }
  if (age < .55 && target.kind === 'plate' && !mutedMotion.matches) ctx.rotate(Math.sin(age * 33) * (.55 - age) * .33);
  if (target.kind === 'plate') {
    oval(0, 0, r * 1.10, r * 1.1, '#593e2d');
    oval(0, -r * .09, r, r, age < .18 ? '#fff4bb' : '#e2b261');
    oval(0, -r * .09, r * .72, r * .72, '#253c33');
    oval(0, -r * .09, r * .46, r * .46, '#f3d891');
    oval(0, -r * .09, r * .26, r * .26, '#cc684c');
    oval(-r * .6, -r * .7, r * .08, r * .08, '#fcf1c7');
  }
  if (target.kind === 'glass') {
    const pane = [[-r, -r * .72], [r * .78, -r * .92], [r, r * .7], [-r * .76, r * .9]];
    path(pane, '#344f4d');
    path(pane.map(([px, py]) => [px * .87, py * .83]), '#c2e9d3');
    path([[-r * .68, -r * .59], [-r * .28, -r * .65], [r * .64, r * .36], [r * .71, r * .54], [r * .40, r * .59]], '#f1ffe0c4');
    path([[-r * .68, -.11 * r], [-r * .17, r * .67], [-r * .60, r * .73]], '#84bbab');
  }
  if (target.kind === 'pulse') {
    path([[-r * .57, -r], [r * .57, -r], [r, 0], [r * .57, r], [-r * .57, r], [-r, 0]], '#514460');
    path([[-r * .49, -r * .79], [r * .49, -r * .79], [r * .80, 0], [r * .49, r * .79], [-r * .49, r * .79], [-r * .80, 0]], '#ba96cc');
    oval(0, 0, r * .42, r * .42, '#805d9d');
    oval(0, 0, r * .25, r * .25, '#f8e6d9');
  }
  if (target.kind === 'disc') {
    oval(0, 2 * scale, r, r * .66, '#563c2c');
    oval(0, 0, r, r * .63, '#ed8754');
    oval(0, 0, r * .72, r * .4, '#ffe3a5');
    oval(0, 0, r * .42, r * .23, '#cc6747');
  }
  ctx.restore();
}

function drawLauncher() {
  const model = arsenal[selected];
  const baseX = (.5 + (aim.x - .5) * .13) * width;
  const baseY = height + 39 * scale;
  const exit = muzzle();
  const angle = Math.atan2(exit.y - baseY, exit.x - baseX);
  const reach = Math.hypot(exit.x - baseX, exit.y - baseY) / scale;
  const back = Math.max(25, reach - 86);
  const shell = model.shell;
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  const finish = ctx.createLinearGradient(0, -35, 0, 35);
  finish.addColorStop(0, '#738078');
  finish.addColorStop(.38, '#364943');
  finish.addColorStop(1, '#1d2b29');
  const casing = [[0, -shell - 10], [back + 18, -shell], [reach - 15, -shell * .59],
    [reach, -12], [reach, 12], [reach - 19, shell * .55], [back + 19, shell], [0, shell + 10]];
  path(casing, '#152923');
  path(casing.map(([x, y]) => [x - 2, y * .87]), finish);
  path([[back - 24, -shell * .7], [reach - 39, -shell * .47], [reach - 24, 0],
    [reach - 39, shell * .48], [back - 24, shell * .71], [back - 10, 0]], '#6f7160');
  path([[back - 17, -shell * .5], [reach - 43, -shell * .36], [reach - 30, 0],
    [reach - 43, shell * .36], [back - 17, shell * .5], [back - 6, 0]], '#283a32');
  for (let i = 0; i < 3; i++) {
    const x = reach - model.head + i * 8;
    line(x, -8, x + 3, 8, model.ink, 2.8);
  }
  oval(reach - 6, 0, 7, 12, '#1b2620');
  oval(reach - 4, 0, 4, 8, model.ink);
  if (now < nextLaunch - model.gap + .08) oval(reach + 6, 0, 10, 9, model.ink);
  ctx.restore();
}

function drawReticle() {
  const x = aim.x * width;
  const y = aim.y * height;
  const r = (arsenal[selected].scatter ? 13 : 9) * scale;
  const colour = '#fff9dc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, tau);
  ctx.strokeStyle = '#243029';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  oval(x, y, 2.2, 2.2, '#27372e');
  oval(x, y, 1.1, 1.1, colour);
}

function scopeFrame() {
  const x = width / 2, y = height / 2;
  const radius = Math.min(width, height) * .42;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(x, y, radius, 0, tau);
  ctx.fillStyle = '#100d1af7';
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, tau);
  ctx.strokeStyle = '#ad91aa';
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const sign of [-1, 1]) {
    line(x + sign * 7, y, x + sign * radius * .75, y, '#ffdfb4', 1);
    line(x, y + sign * 7, x, y + sign * radius * .75, '#ffdfb4', 1);
  }
  oval(x, y, 1.4, 1.4, '#fff0c9');
}

function drawEffects(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.life -= dt;
    if (ring.life <= 0) {
      rings.splice(i, 1);
      continue;
    }
    if (ring.burst) {
      const duration = ring.burst === 'orb' ? .66 : .45;
      const progress = 1 - ring.life / duration;
      const radius = ring.size * (.18 + progress * .82);
      ctx.globalAlpha = .55 * (1 - progress);
      oval(ring.x, ring.y, radius, radius * .78, ring.colour);
      if (!mutedMotion.matches) {
        ctx.globalAlpha = .8 * (1 - progress);
        if (ring.burst === 'orb') {
          for (let i = 0; i < 8; i++) {
            const angle = i * tau / 8;
            oval(ring.x + Math.cos(angle) * radius, ring.y + Math.sin(angle) * radius * .78,
              3 * scale, 3 * scale, '#f8dcff');
          }
        } else {
          for (let i = 0; i < 10; i++) {
            const angle = i * tau / 10;
            line(ring.x + Math.cos(angle) * radius * .48, ring.y + Math.sin(angle) * radius * .48,
              ring.x + Math.cos(angle) * radius, ring.y + Math.sin(angle) * radius, '#ffe0a3', 2 * scale);
          }
        }
      }
      continue;
    }
    ctx.globalAlpha = ring.life / .43;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.size * (1 - ring.life / .5), 0, tau);
    ctx.strokeStyle = ring.colour;
    ctx.lineWidth = 2.8 * scale;
    ctx.stroke();
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const dot = particles[i];
    dot.life -= dt;
    if (dot.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    dot.x += dot.vx * dt;
    dot.y += dot.vy * dt;
    dot.vy += 125 * dt;
    ctx.globalAlpha = Math.min(1, dot.life * 2.5);
    oval(dot.x, dot.y, 2.3 * scale, 1.9 * scale, dot.colour);
  }
  ctx.globalAlpha = 1;
}

function drawScoreLabels(dt) {
  for (let i = scoreLabels.length - 1; i >= 0; i--) {
    const label = scoreLabels[i];
    label.life -= dt;
    if (label.life <= 0) {
      scoreLabels.splice(i, 1);
      continue;
    }
    const zoom = scoped ? scopeZoom : 1;
    const x = scoped ? width / 2 + (label.x - aim.x) * width * zoom : label.x * width;
    const y = scoped ? height / 2 + (label.y - aim.y) * height * zoom : label.y * height;
    if (scoped && Math.hypot(x-width/2, y-height/2) > Math.min(width,height)*.36) continue;
    const rise = mutedMotion.matches ? 0 : (1 - label.life / .85) * 16;
    ctx.globalAlpha = Math.min(1, label.life * 3);
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#20172d';
    ctx.lineWidth = 3;
    ctx.fillStyle = label.multiplier > 1 ? '#ffd48e' : '#fff5df';
    const text = '+'+label.value+(label.multiplier > 1 ? '  ×'+label.multiplier : '');
    const labelX = clamp(x, 42, width - 42);
    ctx.strokeText(text, labelX, y - 19 - rise);
    ctx.fillText(text, labelX, y - 19 - rise);
    ctx.globalAlpha = 1;
  }
}

function animate(timestamp) {
  const dt = Math.min(.033, (timestamp - (lastFrame ?? timestamp)) / 1000);
  now += dt;
  syncLaunch();
  lastFrame = timestamp;
  const aimStep = dt / (scoped ? scopeZoom : 1);
  if (keys.has('ArrowLeft')) aim.x = clamp(aim.x - aimStep * .29, .015, .985);
  if (keys.has('ArrowRight')) aim.x = clamp(aim.x + aimStep * .29, .015, .985);
  if (keys.has('ArrowUp')) aim.y = clamp(aim.y - aimStep * .43, .06, .95);
  if (keys.has('ArrowDown')) aim.y = clamp(aim.y + aimStep * .43, .06, .95);
  ctx.fillStyle = '#282037';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  if (scoped) {
    ctx.translate(width / 2, height / 2);
    ctx.scale(scopeZoom, scopeZoom);
    ctx.translate(-aim.x * width, -aim.y * height);
  }
  ctx.drawImage(background, 0, 0, width, height);
  for (const target of [...targets].sort((first, second) => first.y - second.y)) drawTarget(target);

  for (let i = queued.length - 1; i >= 0; i--) {
    const launch = queued[i];
    if (now < launch.at) continue;
    const { from } = launch;
    const distance = Math.hypot(launch.x - from.x, launch.y - from.y);
    const duration = Math.max(.065, distance / launch.model.speed);
    shots.push({ ...launch, from, elapsed: 0, duration });
    queued.splice(i, 1);
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];
    shot.elapsed += dt;
    const t = Math.min(1, shot.elapsed / shot.duration);
    const curve = (u) => [
      (shot.from.x + (shot.x - shot.from.x) * u) * width,
      (shot.from.y + (shot.y - shot.from.y) * u - 4 * (shot.model.arc || 0) * u * (1 - u)) * height,
    ];
    const [x, y] = curve(t);
    const [tailX, tailY] = curve(Math.max(0, t - .17));
    if (!mutedMotion.matches) line(x, y, tailX, tailY, shot.model.ink + 'aa', 2.4 * scale);
    oval(x, y, (shot.model.splash ? 5 : 3) * scale, (shot.model.splash ? 5 : 3) * scale, shot.model.ink);
    if (t >= 1) {
      impact(shot);
      shots.splice(i, 1);
    }
  }
  drawEffects(dt);
  ctx.restore();
  if (scoped) scopeFrame();
  else {
    drawLauncher();
    drawReticle();
  }
  drawScoreLabels(dt);
  if (clearResultAt && now > clearResultAt) {
    byId('result').textContent = '';
    clearResultAt = 0;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
