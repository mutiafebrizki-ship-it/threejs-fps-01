// The armoury: three guns and one grenade. Each gun is a row of numbers — damage, head
// multiplier, fire gap, magazine, reload time, spread and recoil — plus a small box-built
// view model. Spread grows with every shot and with movement, and shrinks when the player
// stops and crouches, so stopping to aim pays. Grenades fly, bounce once, then burst.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 Sidearm', price: 0,
    damage: 26, headMult: 3.5, gap: 0.17, mag: 12, reserve: 48,
    reloadTime: 1.3, spreadStill: 0.004, spreadMove: 0.03, kick: 0.011, bloom: 0.004,
  },
  smg: {
    id: 'smg', slot: 2, name: 'VK-9 Ripper', price: 1500,
    damage: 19, headMult: 3.2, gap: 0.075, mag: 28, reserve: 112,
    reloadTime: 1.7, spreadStill: 0.008, spreadMove: 0.034, kick: 0.008, bloom: 0.005,
  },
  rifle: {
    id: 'rifle', slot: 3, name: 'AR-77 Longline', price: 2700,
    damage: 34, headMult: 4, gap: 0.105, mag: 25, reserve: 75,
    reloadTime: 2.1, spreadStill: 0.002, spreadMove: 0.026, kick: 0.014, bloom: 0.006,
  },
};

const GRENADE_PRICE = 300;
const GRENADE_FUSE = 1.25;
const GRENADE_RADIUS = 7;

function gunModel(kind, mats) {
  const group = new THREE.Group();
  if (kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), mats.ink);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), mats.grip);
    grip.position.set(0, -0.08, 0.09);
    group.add(slide, grip);
  } else if (kind === 'smg') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), mats.ink);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), mats.grip);
    barrel.position.set(0, 0.02, -0.27);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), mats.grip);
    mag.position.set(0, -0.11, -0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), mats.grip);
    stock.position.set(0, -0.01, 0.24);
    group.add(body, barrel, mag, stock);
  } else {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.44), mats.ink);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), mats.grip);
    barrel.position.set(0, 0.03, -0.4);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), mats.grip);
    sight.position.set(0, 0.08, -0.05);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.09), mats.grip);
    mag.position.set(0, -0.11, 0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.16), mats.grip);
    stock.position.set(0, -0.02, 0.22);
    group.add(receiver, barrel, sight, mag, stock);
  }
  // The model sits low and right, far enough forward that the stock never reaches the
  // camera plane, and scaled down so it reads as a rifle in the hand, not a plank
  // across the screen: a gun poking through the lens reads as a flat bar.
  group.position.set(0.27, -0.23, -0.6);
  group.scale.setScalar(0.7);
  return group;
}

export function createWeapons(camera) {
  const mats = {
    ink: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 }),
    grip: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.7, metalness: 0.2 }),
  };
  const models = {};
  for (const kind of Object.keys(WEAPONS)) {
    models[kind] = gunModel(kind, mats);
    models[kind].visible = false;
    camera.add(models[kind]);
  }
  models.pistol.visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -1.02);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.7);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    grenades: 0,
    owned: { pistol: true, smg: false, rifle: false },
  };
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.steelDark), roughness: 0.4, metalness: 0.6 });

  function def() { return WEAPONS[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.03);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.6 + state.kick;
    model.rotation.x = state.kick * 2.4;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.5 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    if (state.flash > 0) flash.rotation.z = state.flash * 40;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  function stepGrenades(dt, colliders, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;
      const next = g.mesh.position.clone().addScaledVector(g.vel, dt);
      let bounced = false;
      for (const solid of colliders) {
        if (next.x > solid.min.x - 0.09 && next.x < solid.max.x + 0.09
          && next.y > solid.min.y - 0.09 && next.y < solid.max.y + 0.09
          && next.z > solid.min.z - 0.09 && next.z < solid.max.z + 0.09) {
          bounced = true;
          break;
        }
      }
      if (bounced) {
        g.vel.multiplyScalar(-0.35);
        g.vel.y = Math.abs(g.vel.y) * 0.4 + 0.5;
      } else {
        g.mesh.position.copy(next);
      }
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        g.mesh.parent?.remove(g.mesh);
        grenades.splice(i, 1);
        onExplode(pos);
      }
    }
  }

  return {
    state,
    def,
    grenades,
    step,
    stepGrenades,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.06;
      state.bloom = Math.min(0.05, state.bloom + def().bloom);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reloadTime;
      return true;
    },
    spread(speed, crouched) {
      const moving = Math.min(1, speed / 5.4);
      const base = def().spreadStill + moving * def().spreadMove;
      return (base + state.bloom) * (crouched ? 0.6 : 1);
    },
    select(id) {
      if (!state.owned[id] || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.bloom = 0;
      return true;
    },
    buy(id, money) {
      const weapon = WEAPONS[id];
      if (!weapon || state.owned[id] || money < weapon.price) return -1;
      state.owned[id] = true;
      this.select(id);
      return weapon.price;
    },
    buyGrenade(money) {
      if (money < GRENADE_PRICE || state.grenades >= 2) return -1;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    throwGrenade(origin, direction) {
      if (state.grenades <= 0) return false;
      state.grenades -= 1;
      const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      mesh.position.copy(origin);
      mesh.castShadow = true;
      camera.parent.add(mesh);
      grenades.push({ mesh, vel: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)), fuse: GRENADE_FUSE });
      return true;
    },
    clearGrenades() {
      for (const g of grenades) g.mesh.parent?.remove(g.mesh);
      grenades.length = 0;
    },
    resetLoadout() {
      state.owned = { pistol: true, smg: false, rifle: false };
      state.grenades = 0;
      this.select('pistol');
      state.mag = WEAPONS.pistol.mag;
      state.reserve = WEAPONS.pistol.reserve;
    },
    grenadePrice() { return GRENADE_PRICE; },
    grenadeRadius() { return GRENADE_RADIUS; },
  };
}
