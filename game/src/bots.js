// The nine bots: four attackers beside the player, five defenders. A bot walks a lane
// route, holds an angle, and scans; when it sees an enemy it stops, aims and fires in
// bursts. Bots hear nearby gunfire and turn toward it, rotate to a planted spike, and the
// spike carrier among them will plant while a defender will defuse a clear site.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { LANES, SPAWNS, SITES, segmentBlocked } from './world.js';

const BOT_NAMES = {
  atk: ['Dune', 'Rook', 'Sable', 'Vex'],
  def: ['Ash', 'Brick', 'Cinder', 'Flint', 'Gale'],
};
const BOT_GUNS = {
  atk: ['smg', 'rifle', 'smg', 'rifle'],
  def: ['rifle', 'smg', 'rifle', 'rifle', 'smg'],
};
const BOT_DAMAGE = { smg: 14, rifle: 20, pistol: 12 };
const WALK_SPEED = 3.4;
const SIGHT_RANGE = 46;
const BURST_SHOTS = 3;

function botMaterials(team) {
  return {
    torso: new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? PALETTE.sand : PALETTE.steel), roughness: 0.8 }),
    head: new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'atk' ? PALETTE.rust : PALETTE.steelDark), roughness: 0.7 }),
    legs: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.85 }),
    gun: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.3 }),
  };
}

export function createBots(scene, world) {
  const torsoGeo = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.2, 0.62, 0.24);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.5);
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

  const bots = [];
  const hitMeshes = [];
  const tracers = [];

  function makeBot(team, index) {
    const mats = botMaterials(team);
    const group = new THREE.Group();
    const legL = new THREE.Mesh(legGeo, mats.legs);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, mats.legs);
    legR.position.set(0.14, 0.31, 0);
    const torso = new THREE.Mesh(torsoGeo, mats.torso);
    torso.position.y = 1.02;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeo, mats.head);
    head.position.y = 1.58;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeo, mats.gun);
    gun.position.set(0.22, 1.12, -0.2);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    scene.add(group);
    const bot = {
      name: BOT_NAMES[team][index],
      team,
      gun: BOT_GUNS[team][index],
      group, torso, head,
      pos: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      alive: true,
      route: [],
      wp: 0,
      holdUntil: 0,
      scanDir: 0,
      burstLeft: 0,
      nextShotAt: 0,
      target: null,
      fall: 0,
      speed: 0,
      flash: 0,
      hasSpike: false,
      investigate: null,
      kills: 0,
      deaths: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) makeBot('atk', i);
  for (let i = 0; i < 5; i += 1) makeBot('def', i);

  // A bot is a 0.68 m wide, 1.7 m tall box at ground level: blocked when its footprint
  // overlaps a collider whose height range reaches into that box.
  function blocked(x, z) {
    for (const solid of world.colliders) {
      if (solid.max.y < 0.05 || solid.min.y > 1.7) continue;
      if (x > solid.min.x - 0.34 && x < solid.max.x + 0.34
        && z > solid.min.z - 0.34 && z < solid.max.z + 0.34) return true;
    }
    return false;
  }

  function moveToward(bot, tx, tz, dt) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, WALK_SPEED * dt);
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    if (!blocked(nx, bot.pos.z)) bot.pos.x = nx;
    if (!blocked(bot.pos.x, nz)) bot.pos.z = nz;
    bot.yaw = Math.atan2(dx, dz) + Math.PI;
    bot.speed = WALK_SPEED;
    return dist - step < 0.4;
  }

  function canSee(bot, fighter) {
    if (!fighter.alive) return false;
    const dx = fighter.pos.x - bot.pos.x;
    const dz = fighter.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SIGHT_RANGE) return false;
    const facing = Math.atan2(-Math.sin(bot.yaw), -Math.cos(bot.yaw));
    const toTarget = Math.atan2(dx, dz);
    let diff = Math.abs(toTarget - facing);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > 1.15 && dist > 6) return false;
    const eye = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.5, bot.pos.z);
    const chest = new THREE.Vector3(fighter.pos.x, fighter.pos.y + 1.1, fighter.pos.z);
    return !segmentBlocked(world.colliders, eye, chest);
  }

  function fireTracer(from, to) {
    const line = new THREE.Line(tracerGeo.clone(), tracerMat.clone());
    line.geometry.setFromPoints([from, to]);
    scene.add(line);
    tracers.push({ line, left: 0.12 });
  }

  function reset(roundSeed, rng) {
    const atkLanes = ['along', 'mid', 'bmid', 'blong'];
    const defHolds = ['ahold', 'bhold', 'midhold', 'ahold', 'bhold'];
    for (const bot of bots) {
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.burstLeft = 0;
      bot.nextShotAt = 0;
      bot.target = null;
      bot.hasSpike = false;
      bot.investigate = null;
      bot.speed = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      if (bot.team === 'atk') {
        const spawn = SPAWNS.attack[bots.indexOf(bot)];
        bot.pos.set(spawn[0], 0, spawn[1]);
        const lane = atkLanes[bots.indexOf(bot) % atkLanes.length];
        bot.route = LANES[lane].map(([x, z]) => [x, z]);
        bot.yaw = Math.PI;
      } else {
        const spawn = SPAWNS.defend[bots.indexOf(bot) - 4];
        bot.pos.set(spawn[0], 0, spawn[1]);
        const hold = defHolds[bots.indexOf(bot) - 4];
        bot.route = LANES[hold].map(([x, z]) => [x, z]);
        bot.yaw = 0;
      }
      bot.wp = 0;
      bot.holdUntil = 0;
      bot.scanDir = rng() * Math.PI * 2;
    }
    // The player carries the spike at the start of a round; bots pick it up only after
    // it is dropped. No bot starts with it.
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flash = 0.12;
    if (bot.health > 0) return false;
    bot.health = 0;
    bot.alive = false;
    bot.deaths += 1;
    bot.fall = 0.0001;
    return true;
  }

  function step(dt, ctx) {
    const now = ctx.time;
    for (const tracer of tracers) tracer.left -= dt;
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      if (tracers[i].left <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall > 0 && bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.45);
          bot.group.rotation.x = -bot.fall * 1.5;
          bot.group.position.y = -bot.fall * 0.1;
        }
        continue;
      }
      bot.flash = Math.max(0, bot.flash - dt);
      bot.torso.material.emissive = new THREE.Color(bot.flash > 0 ? 0x661111 : 0x000000);
      bot.speed = 0;

      // Pick the nearest enemy this bot can see.
      let best = null;
      let bestDist = Infinity;
      for (const fighter of ctx.fighters) {
        if (fighter.team === bot.team || !fighter.alive) continue;
        const dist = Math.hypot(fighter.pos.x - bot.pos.x, fighter.pos.z - bot.pos.z);
        if (dist < bestDist && canSee(bot, fighter)) {
          best = fighter;
          bestDist = dist;
        }
      }
      bot.target = best;

      if (best) {
        const dx = best.pos.x - bot.pos.x;
        const dz = best.pos.z - bot.pos.z;
        bot.yaw = Math.atan2(dx, dz) + Math.PI;
        if (bot.burstLeft === 0 && now >= bot.nextShotAt) {
          bot.burstLeft = BURST_SHOTS;
          bot.nextShotAt = now + 0.75 + Math.random() * 0.3;
        }
        if (bot.burstLeft > 0 && now >= bot.nextShotAt - 0.75) {
          bot.burstLeft -= 1;
          bot.nextShotAt = now + 0.13;
          const from = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.35, bot.pos.z);
          const to = new THREE.Vector3(best.pos.x, best.pos.y + 1.1, best.pos.z);
          fireTracer(from, to);
          ctx.onShot(bot);
          const targetSpeed = best.speed || 0;
          const chance = Math.max(0.1, Math.min(0.62, 0.58 - bestDist * 0.008 - targetSpeed * 0.035));
          if (Math.random() < chance) {
            const dmg = BOT_DAMAGE[bot.gun] * (0.85 + Math.random() * 0.3);
            ctx.onDamage(best, dmg, bot);
          }
        }
        continue;
      }

      // No target: follow the objective.
      let goal = null;
      if (ctx.spikePlanted && bot.team === 'def') {
        goal = [ctx.spikeSite.x, ctx.spikeSite.z];
        const nearSpike = Math.hypot(bot.pos.x - ctx.spikePos.x, bot.pos.z - ctx.spikePos.z) < 1.8;
        const attackersNear = ctx.fighters.some((f) => f.team === 'atk' && f.alive
          && Math.hypot(f.pos.x - ctx.spikePos.x, f.pos.z - ctx.spikePos.z) < 12);
        if (nearSpike && !attackersNear) {
          ctx.onDefusing(bot, dt);
          continue;
        }
      } else if (ctx.spikePlanted && bot.team === 'atk') {
        goal = bot.route[bot.route.length - 1];
      } else if (ctx.spikeDropped && bot.team === 'atk' && !ctx.spikeCarrier) {
        goal = [ctx.spikePos.x, ctx.spikePos.z];
        if (Math.hypot(bot.pos.x - ctx.spikePos.x, bot.pos.z - ctx.spikePos.z) < 1.2) {
          bot.hasSpike = true;
          ctx.onPickup(bot);
        }
      } else if (bot.hasSpike) {
        // Head for the nearer site and plant once inside it.
        const da = Math.hypot(bot.pos.x - SITES.A.x, bot.pos.z - SITES.A.z);
        const db = Math.hypot(bot.pos.x - SITES.B.x, bot.pos.z - SITES.B.z);
        const site = da <= db ? SITES.A : SITES.B;
        goal = [site.x, site.z];
        const inSite = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z) < site.r;
        if (inSite) {
          ctx.onPlanting(bot, dt);
          continue;
        }
      }
      if (!goal && bot.investigate) {
        goal = bot.investigate;
        if (Math.hypot(bot.pos.x - goal[0], bot.pos.z - goal[1]) < 1) bot.investigate = null;
      }
      if (!goal) {
        if (bot.wp < bot.route.length) {
          goal = bot.route[bot.wp];
          if (now < bot.holdUntil) {
            bot.yaw += Math.sin(now * 0.7 + bot.scanDir) * dt * 0.6;
            continue;
          }
          if (moveToward(bot, goal[0], goal[1], dt)) {
            bot.wp += 1;
            bot.holdUntil = now + 1.2 + Math.random() * 2;
          }
          continue;
        }
        bot.yaw += Math.sin(now * 0.5 + bot.scanDir) * dt * 0.5;
        continue;
      }
      moveToward(bot, goal[0], goal[1], dt);
    }
    // Sync meshes.
    for (const bot of bots) {
      bot.group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
      if (bot.alive) bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    reset,
    step,
    damage,
    hearShot(pos) {
      for (const bot of bots) {
        if (!bot.alive || bot.target) continue;
        if (Math.hypot(bot.pos.x - pos.x, bot.pos.z - pos.z) < 26) {
          bot.investigate = [pos.x, pos.z];
        }
      }
    },
    aimPoint(bot) {
      return new THREE.Vector3(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
  };
}
