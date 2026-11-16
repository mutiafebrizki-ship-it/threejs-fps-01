// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?scene=menu|fight|plant|score with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch } from './match.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const sceneName = params.get('scene');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const bots = createBots(scene, world);
const match = createMatch(bots.bots);
const hud = createHud(world, {
  onPlay: handlePlay,
  onBuy: handleBuy,
});
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const tracers = [];

const body = player.state;
const spikeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.14, 0.14),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.7 }),
);
spikeMesh.castShadow = true;
scene.add(spikeMesh);
const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);
scene.add(spikeLight);

let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let roundEndAt = 0;
let buyOpen = false;
let shake = 0;
let lastBeep = 0;
let mapTimer = 0;

const playerFighter = {
  name: 'You', team: 'atk', isPlayer: true,
  get pos() { return body.position; },
  get alive() { return body.alive; },
  get speed() { return player.speed(); },
};

function handlePlay() {
  audio.unlock();
  if (sceneName) return;
  const phase = match.state.phase;
  if (phase === 'menu') {
    match.startMatch();
    resetRound();
    input.requestLock();
  } else if (phase === 'roundEnd') {
    match.nextRound();
    resetRound();
    input.requestLock();
  } else if (phase === 'matchEnd') {
    match.startMatch();
    resetRound();
    input.requestLock();
  } else if (phase === 'live' || phase === 'buy') {
    input.requestLock();
  }
}

function onLockChange(locked) {
  if (sceneName) return;
  const phase = match.state.phase;
  if (locked) {
    started = true;
    hud.hideOverlay();
    // The buy menu stays open through the buy phase: buying is by keyboard (1-4)
    // while the pointer is locked, and by mouse when it is not.
  } else if (phase === 'menu') {
    hud.showOverlay('start');
  } else if (phase === 'roundEnd') {
    hud.showOverlay('roundEnd', `${match.state.roundWinner === 'atk' ? 'Attackers' : 'Defenders'} take round ${match.state.round} — ${match.state.roundReason}.`);
  } else if (phase === 'matchEnd') {
    hud.showOverlay('matchEnd', `${match.state.matchWinner === 'atk' ? 'Attackers' : 'Defenders'} take Yard 7, ${match.state.score.atk} — ${match.state.score.def}.`);
  } else if (!body.alive) {
    hud.showOverlay('paused');
  } else {
    hud.showOverlay('paused');
  }
}

function resetRound() {
  const spawn = SPAWNS.attack[0];
  player.reset(spawn[0], spawn[1], 0);
  bots.reset(seed, rng);
  weapons.clearGrenades();
  hud.hideOverlay();
  hud.showBuy(true, match.state.money, weapons.state.owned);
  buyOpen = true;
  roundEndAt = 0;
}

function handleBuy(id) {
  const m = match.state;
  if (m.phase !== 'buy') return;
  if (id === 'grenade') {
    const cost = weapons.buyGrenade(m.money);
    if (cost < 0) { audio.denied(); return; }
    m.money -= cost;
    audio.buy();
  } else if (weapons.state.owned[id]) {
    weapons.select(id);
    const def = WEAPONS[id];
    weapons.state.mag = def.mag;
    weapons.state.reserve = def.reserve;
    audio.buy();
  } else {
    const cost = weapons.buy(id, m.money);
    if (cost < 0) { audio.denied(); return; }
    m.money -= cost;
    audio.buy();
  }
  hud.showBuy(true, m.money, weapons.state.owned);
  syncHud();
}

function addTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 }));
  scene.add(line);
  tracers.push({ line, left: 0.09 });
}

function shoot(spread, forced) {
  if (!weapons.takeRound()) {
    audio.dry();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (rng() * 2 - 1) * spread;
  direction.y += (rng() * 2 - 1) * spread;
  direction.z += (rng() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const muzzle = camera.position.clone().addScaledVector(direction, 0.6);
  const def = weapons.def();
  if (hit) {
    addTracer(muzzle, hit.point);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const head = hit.object.userData.part === 'head';
      const dmg = def.damage * (head ? def.headMult : 1);
      const killed = bots.damage(bot, dmg, head ? 'head' : 'torso');
      if (killed) {
        match.recordKill('You', bot.name, head);
        audio.kill();
      } else {
        audio.hit();
      }
      hud.hitMarker(killed, sceneName ? 4000 : 120);
    }
  } else {
    addTracer(muzzle, camera.position.clone().addScaledVector(direction, 60));
  }
  weapons.pullTrigger();
  player.kick(def.kick * (0.8 + rng() * 0.5), (rng() * 2 - 1) * 0.004);
  audio.shot(weapons.state.current);
  bots.hearShot(body.position);
  shake = Math.min(0.02, shake + 0.006);
  return true;
}

function damagePlayer(amount, attacker) {
  if (!body.alive) return;
  body.health -= amount;
  hud.damageFlash();
  audio.hurt();
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    match.recordKill(attacker ? attacker.name : 'Yard 7', 'You', false);
    if (match.state.spike.carrier === 'player') {
      match.dropSpike(body.position.x, body.position.z);
    }
    hud.banner('You are down — your team fights on');
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function explodeGrenade(pos) {
  audio.explosion();
  shake = 0.05;
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.8 }),
  );
  flash.position.copy(pos);
  scene.add(flash);
  tracers.push({ line: flash, left: 0.3, growing: true });
  const radius = weapons.grenadeRadius();
  const fighters = [playerFighter, ...bots.bots];
  for (const fighter of fighters) {
    if (!fighter.alive) continue;
    const d = Math.hypot(fighter.pos.x - pos.x, fighter.pos.z - pos.z);
    if (d > radius) continue;
    const dmg = Math.round(95 * (1 - d / radius) + 10);
    if (fighter.isPlayer) damagePlayer(dmg, null);
    else if (bots.damage(fighter, dmg, 'torso')) match.recordKill('You', fighter.name, false);
  }
}

function botContext() {
  const spike = match.state.spike;
  return {
    time: elapsed,
    fighters: [playerFighter, ...bots.bots],
    spikePlanted: spike.status === 'planted',
    spikeDropped: spike.status === 'dropped',
    spikeCarrier: spike.carrier,
    spikeSite: spike.site ? SITES[spike.site] : SITES.A,
    spikePos: spike.pos,
    onShot(bot) {
      if (Math.hypot(bot.pos.x - body.position.x, bot.pos.z - body.position.z) < 40) audio.distantShot();
    },
    onDamage(fighter, amount, attacker) {
      if (fighter.isPlayer) {
        damagePlayer(amount, attacker);
      } else if (bots.damage(fighter, amount, 'torso')) {
        match.recordKill(attacker.name, fighter.name, false);
        if (fighter.hasSpike) {
          match.dropSpike(fighter.pos.x, fighter.pos.z);
          fighter.hasSpike = false;
        }
      }
    },
    onPickup(bot) {
      match.pickUpSpike(bot);
    },
    onPlanting(bot, dt) {
      if (match.advancePlant(dt, bot, bot.pos.x, bot.pos.z)) {
        hud.banner('Spike planted on site ' + match.state.spike.site + '!');
        audio.plantTick();
      }
    },
    onDefusing(bot, dt) {
      match.advanceDefuse(dt);
    },
  };
}

function syncCamera() {
  let eye = body.position.y + body.eye;
  if (!body.alive) eye = Math.max(0.5, eye - 0.9);
  camera.position.set(body.position.x, eye, body.position.z);
  const shX = shake > 0 ? (rng() * 2 - 1) * shake : 0;
  const shY = shake > 0 ? (rng() * 2 - 1) * shake : 0;
  camera.rotation.set(body.pitch + shX, body.yaw + shY, 0, 'YXZ');
}

function syncHud() {
  const m = match.state;
  hud.setHealth(body.health);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.state.grenades, weapons.def().name);
  hud.setTimer(m.timer, m.phase);
  hud.setScore(m.score.atk, m.score.def, m.round);
  hud.setMoney(m.money);
  hud.setFeed(m.feed);
  const spreadPx = 6 + weapons.spread(player.speed(), body.crouched) * 900 + weapons.state.bloom * 500;
  hud.setSpread(spreadPx);
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 0.08);
  const m = match.state;
  const prevPhase = m.phase;

  if (m.phase === 'buy' || m.phase === 'live') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
    weapons.stepGrenades(dt, world.colliders, explodeGrenade);
    if (m.phase === 'live') bots.step(dt, botContext());
  }

  // Planting: hold E inside a site while carrying the spike.
  const spike = m.spike;
  if (m.phase === 'live' && body.alive && spike.carrier === 'player' && input.state.keys.has('KeyE')) {
    const site = match.siteOf(body.position.x, body.position.z);
    if (site) {
      if (match.advancePlant(dt, 'player', body.position.x, body.position.z)) {
        hud.banner('Spike planted on site ' + spike.site + '!');
        audio.plantTick();
        bots.hearShot(body.position);
      } else {
        hud.showChannel('PLANTING THE SPIKE — HOLD E', spike.plantProgress);
        if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.beep();
      }
    } else {
      hud.showChannel('REACH A SITE TO PLANT — HOLD E', 0);
    }
  } else if (m.phase === 'live' && spike.status === 'planted') {
    const d = Math.hypot(body.position.x - spike.pos.x, body.position.z - spike.pos.z);
    if (d < 12) hud.showChannel('SPIKE ARMED — DEFEND IT', 1 - (elapsed - spike.plantedAt) / match.spikeFuse);
    else hud.hideChannel();
  } else {
    hud.hideChannel();
  }

  // Spike beeps faster as the fuse runs down.
  if (spike.status === 'planted') {
    const left = match.spikeFuse - (elapsed - spike.plantedAt);
    const interval = Math.max(0.25, left / match.spikeFuse);
    if (elapsed - lastBeep > interval) {
      lastBeep = elapsed;
      audio.beep();
    }
  }

  const alive = {
    atk: (body.alive ? 1 : 0) + bots.aliveCount('atk'),
    def: bots.aliveCount('def'),
  };
  match.tick(dt, alive);

  if (prevPhase !== m.phase && (m.phase === 'roundEnd' || m.phase === 'matchEnd')) {
    roundEndAt = elapsed + 2.5;
    const winner = m.roundWinner === 'atk' ? 'Attackers' : 'Defenders';
    hud.banner(`${winner} win round ${m.round} — ${m.roundReason}`);
    if (m.phase === 'roundEnd') audio.roundWin();
    else audio.roundWin();
    if (m.phase === 'matchEnd') hud.banner(`${winner} take Yard 7, ${m.score.atk} — ${m.score.def}`);
  }
  if ((m.phase === 'roundEnd' || m.phase === 'matchEnd') && roundEndAt > 0 && elapsed >= roundEndAt) {
    roundEndAt = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    if (m.phase === 'matchEnd') hud.showOverlay('matchEnd', `${m.matchWinner === 'atk' ? 'Attackers' : 'Defenders'} take Yard 7, ${m.score.atk} — ${m.score.def}.`);
    else hud.showOverlay('roundEnd', `${m.roundWinner === 'atk' ? 'Attackers' : 'Defenders'} take round ${m.round} — ${m.roundReason}.`);
  }
  if (prevPhase === 'buy' && m.phase === 'live') {
    hud.showBuy(false, 0, {});
    buyOpen = false;
    hud.banner(`Round ${m.round} — plant the spike`);
  }

  // Spike mesh follows its state.
  if (spike.status === 'dropped' || spike.status === 'planted') {
    spikeMesh.visible = true;
    spikeMesh.position.copy(spike.pos);
    spikeMesh.position.y = 0.25;
    spikeLight.position.copy(spike.pos);
    spikeLight.position.y = 1;
    spikeLight.intensity = spike.status === 'planted' ? 6 + Math.sin(elapsed * 6) * 4 : 2;
  } else if (spike.status === 'carried' && spike.carrier && spike.carrier !== 'player') {
    const carrier = spike.carrier;
    spikeMesh.visible = true;
    spikeMesh.position.set(carrier.pos.x, carrier.pos.y + 1.0, carrier.pos.z);
    spikeLight.position.set(carrier.pos.x, carrier.pos.y + 1.5, carrier.pos.z);
    spikeLight.intensity = 2;
  } else {
    spikeMesh.visible = false;
    spikeLight.intensity = 0;
  }

  for (let i = tracers.length - 1; i >= 0; i -= 1) {
    const t = tracers[i];
    t.left -= dt;
    if (t.growing) {
      const s = 1 + (0.3 - t.left) * 14;
      t.line.scale.setScalar(Math.max(0.1, s));
      t.line.material.opacity = Math.max(0, t.left / 0.3) * 0.8;
    } else {
      t.line.material.opacity = Math.max(0, t.left / 0.09) * 0.85;
    }
    if (t.left <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }

  mapTimer -= dt;
  if (mapTimer <= 0) {
    mapTimer = 0.12;
    hud.drawMinimap(body, bots.bots, spike);
  }
  syncHud();
}

function frameBody(dt) {
  if (frozen) return;
  const look = input.takeLook();
  if (input.state.locked) player.look(look.x, look.y);
  const pressed = input.takePressed();
  for (const code of pressed) {
    if (code === 'KeyM') hud.setMuted(audio.toggleMute());
    if (code === 'KeyB' && match.state.phase === 'buy') {
      buyOpen = !buyOpen;
      hud.showBuy(buyOpen, match.state.money, weapons.state.owned);
    }
    if (code === 'KeyG' && match.state.phase === 'live' && body.alive) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      if (weapons.throwGrenade(camera.position.clone().addScaledVector(dir, 0.5), dir)) audio.grenadePin();
    }
    if (code === 'Digit1') weapons.select('pistol');
    if (code === 'Digit2') {
      if (match.state.phase === 'buy' && !weapons.state.owned.smg) handleBuy('smg');
      else weapons.select('smg');
    }
    if (code === 'Digit3') {
      if (match.state.phase === 'buy' && !weapons.state.owned.rifle) handleBuy('rifle');
      else weapons.select('rifle');
    }
    if (code === 'Digit4' && match.state.phase === 'buy') handleBuy('grenade');
  }
  if (input.state.keys.has('KeyR')) {
    if (weapons.reload()) audio.reload();
  }
  if (input.state.firing && match.state.phase === 'live' && body.alive && weapons.ready()) {
    shoot(sceneName ? 0 : weapons.spread(player.speed(), body.crouched));
  }
  if (input.state.keys.has('Tab')) {
    hud.showScoreboard(true, match.players, match.state.score);
  } else {
    hud.showScoreboard(false, match.players, match.state.score);
  }
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  frameBody(dt);
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function clearTracers() {
  for (const t of tracers) {
    scene.remove(t.line);
    t.line.geometry.dispose();
  }
  tracers.length = 0;
}

function aimAtHead(bot) {
  aimAt(new THREE.Vector3(bot.pos.x, bot.pos.y + 1.58, bot.pos.z));
}

function runScene(name) {
  hud.hideOverlay();
  if (name === 'menu') {
    body.position.set(0, 0, 21);
    body.yaw = 0.12;
    body.pitch = 0.06;
    bots.reset(seed, rng);
    settle(30);
    syncCamera();
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  match.startMatch();
  match.state.phase = 'live';
  match.state.timer = 88;
  const spawn = SPAWNS.attack[0];
  player.reset(spawn[0], spawn[1], 0);
  bots.reset(seed, rng);
  // The rifle must be owned before it can be selected; select() refuses a gun the
  // player does not own, so the order here matters.
  weapons.state.owned.rifle = true;
  weapons.select('rifle');

  if (name === 'fight') {
    body.position.set(2, 0, 12);
    body.yaw = 0;
    body.pitch = 0;
    const d0 = bots.bots[4];
    const d1 = bots.bots[5];
    d0.pos.set(0.5, 0, -2);
    d0.yaw = Math.PI;
    d1.pos.set(-5, 0, -6);
    d1.yaw = Math.PI;
    bots.bots[0].pos.set(-3, 0, 14);
    settle(6);
    // One rifle headshot drops the defender at the mid doors; a second round tags the
    // next one. The feed then reads as the player's own kill.
    aimAtHead(d0);
    shoot(0);
    settle(8);
    aimAt(bots.aimPoint(d1));
    shoot(0);
    settle(6);
    body.health = 100;
    clearTracers();
    match.state.feed = [{ killer: 'You', victim: d0.name, headshot: true, t: 1 }];
    syncHud();
  } else if (name === 'plant') {
    // At the west edge of site A, facing east down the pad: the site container sits
    // mid-frame, a teammate covers ahead, and the defender shows at the north gap.
    // Standing two metres south of the letter board keeps its post out of the centre.
    body.position.set(-27, 0, -14);
    body.yaw = -1.57;
    body.pitch = 0.02;
    match.state.spike.plantProgress = 0.62;
    bots.bots[0].pos.set(-22, 0, -13);
    bots.bots[1].pos.set(-24, 0, -18);
    const d = bots.bots[6];
    d.pos.set(-16, 0, -10);
    d.yaw = Math.PI;
    settle(8);
    body.health = 100;
    clearTracers();
    hud.showChannel('PLANTING THE SPIKE — HOLD E', 0.62);
    syncHud();
  } else if (name === 'score') {
    match.state.score = { atk: 5, def: 3 };
    match.state.phase = 'matchEnd';
    match.state.matchWinner = 'atk';
    match.state.round = 8;
    const kills = [7, 5, 4, 3, 2, 6, 4, 3, 2, 1];
    match.players.forEach((p, i) => {
      p.kills = kills[i % kills.length];
      p.deaths = 8 - (kills[i % kills.length] % 5);
    });
    match.state.feed = [
      { killer: 'You', victim: 'Flint', headshot: true, t: 1 },
      { killer: 'Rook', victim: 'Ash', headshot: false, t: 2 },
      { killer: 'You', victim: 'Cinder', headshot: false, t: 3 },
    ];
    body.position.set(0, 0, 21);
    body.yaw = 0.1;
    body.pitch = 0.05;
    settle(20);
    // The scoreboard alone is the shot: the end-of-match overlay would sit on top of
    // it and hide the table.
    hud.showScoreboard(true, match.players, match.state.score);
    syncHud();
  }
  syncCamera();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Exposed for headless play-testing: the live state, read-only by convention, plus an
// advance() that runs the same frame body the live loop runs, without waiting on the
// display — software rendering here runs near 1 fps, so wall-clock waiting cannot drive
// the 60 Hz simulation in reasonable time.
window.__sandline = {
  match, player, bots, weapons, world, input,
  advance(seconds) {
    const slices = Math.max(1, Math.round(seconds / FIXED_STEP));
    for (let i = 0; i < slices; i += 1) frameBody(FIXED_STEP);
    renderer.render(scene, camera);
  },
};

syncCamera();
syncHud();
hud.showOverlay('start');
if (sceneName) runScene(sceneName);
else requestAnimationFrame(frame);
