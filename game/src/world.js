// Yard 7: a dusk desert freight yard with three lanes and two bombsites. Attackers start
// at the south gate, defenders at the north fence. A-long runs down the west wall, B-long
// down the east wall, and mid cuts through a pair of double doors. Every box is both a
// collider and a surface a bullet stops on; the same list feeds the minimap.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOUNDS = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };

export const SITES = {
  A: { x: -24, z: -16, r: 6.5, label: 'A' },
  B: { x: 24, z: -16, r: 6.5, label: 'B' },
};

export const SPAWNS = {
  attack: [
    [-6, 20], [-2, 21], [2, 21], [6, 20], [0, 18],
  ],
  defend: [
    [-24, -20], [-8, -21], [0, -21], [8, -21], [24, -20],
  ],
};

// Lane waypoints, south to north, for bot routes. Each lane is a list of [x, z] steps.
export const LANES = {
  along: [[-24, 16], [-24, 6], [-24, -6], [-24, -14]],
  mid: [[0, 16], [0, 8], [0, 0], [0, -6], [-8, -10], [-8, -14]],
  blong: [[24, 16], [24, 6], [24, -6], [24, -14]],
  bmid: [[0, 16], [0, 8], [0, 0], [0, -6], [8, -10], [8, -14]],
  ahold: [[-24, -16], [-20, -18], [-27, -12]],
  bhold: [[24, -16], [20, -18], [27, -12]],
  midhold: [[-4, -4], [4, -4], [0, -10]],
};

function letterTexture(letter, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = colour;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'steel' || name === 'steelDark' ? 0.55 : 0.92,
      metalness: name === 'steel' || name === 'steelDark' ? 0.35 : 0.02,
    });
  }
  const padA = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.9, transparent: true, opacity: 0.35 });
  const padB = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.containerB), roughness: 0.9, transparent: true, opacity: 0.4 });

  const colliders = [];
  const shootables = [];
  const mapRects = [];

  function box(w, h, d, x, y, z, material, map = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (map) mapRects.push({ x: x - w / 2, z: z - d / 2, w, d });
    return mesh;
  }

  // Ground and the yard fence.
  box(66, 0.4, 50, 0, -0.2, 0, 'sandDark', false);
  box(0.6, 5, 50, -32.3, 2.5, 0, 'steelDark');
  box(0.6, 5, 50, 32.3, 2.5, 0, 'steelDark');
  box(66, 5, 0.6, 0, 2.5, -24.3, 'steelDark');
  box(66, 5, 0.6, 0, 2.5, 24.3, 'steelDark');

  // Mid wall with the double doors: a gap from x -3.5 to 3.5 at z 0.
  box(10.5, 4.4, 0.8, -8.75, 2.2, 0, 'rust');
  box(10.5, 4.4, 0.8, 8.75, 2.2, 0, 'rust');
  box(0.8, 4.4, 1.6, -3.9, 2.2, 0, 'steel');
  box(0.8, 4.4, 1.6, 3.9, 2.2, 0, 'steel');
  // Door leaves swung open against the wall.
  box(0.3, 3.6, 3.2, -4.6, 1.8, -1.9, 'steelDark');
  box(0.3, 3.6, 3.2, 4.6, 1.8, 1.9, 'steelDark');

  // Lane walls: west and east, each with a connector gap around z 6.
  box(0.8, 4.2, 12, -16, 2.1, -8, 'rust');
  box(0.8, 4.2, 10, -16, 2.1, 17, 'rust');
  box(0.8, 4.2, 12, 16, 2.1, -8, 'rust');
  box(0.8, 4.2, 10, 16, 2.1, 17, 'rust');

  // North cross wall with two gaps into the sites.
  box(10, 4.2, 0.8, -11, 2.1, -8, 'rust');
  box(10, 4.2, 0.8, 11, 2.1, -8, 'rust');
  box(12, 4.2, 0.8, 0, 2.1, -8, 'rust');

  // Site pads and letter boards.
  for (const [key, site] of Object.entries(SITES)) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.06, 9),
      key === 'A' ? padA : padB,
    );
    pad.position.set(site.x, 0.03, site.z);
    pad.receiveShadow = true;
    group.add(pad);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: letterTexture(site.label, key === 'A' ? PALETTE.accent : '#8fd8d2') }),
    );
    board.position.set(site.x, 3.4, site.z + 4.6);
    group.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.25), materials.steelDark);
    post.position.set(site.x, 1.7, site.z + 4.6);
    post.castShadow = true;
    group.add(post);
  }

  // Freight containers: the big cover on each site and one in mid.
  box(6.4, 2.7, 2.6, -27.5, 1.35, -19.5, 'containerA');
  box(6.4, 2.7, 2.6, -19.5, 1.35, -11.5, 'containerB');
  box(6.4, 2.7, 2.6, 27.5, 1.35, -19.5, 'containerB');
  box(6.4, 2.7, 2.6, 19.5, 1.35, -11.5, 'containerA');
  box(7, 2.7, 2.6, 10, 1.35, 12, 'containerA');

  // Crates: single, stacked and long low ones, placed to break sightlines.
  const crates = [
    [1.3, 1.3, 1.3, -8, 0.65, 12, 'crate'],
    [1.3, 1.3, 1.3, -8, 1.95, 12, 'crate'],
    [1.3, 1.3, 1.3, 8, 0.65, 8, 'crate'],
    [1.3, 1.3, 1.3, -24, 0.65, 6, 'crate'],
    [1.3, 1.3, 1.3, -24, 0.65, 4.7, 'crate'],
    [1.3, 1.3, 1.3, 24, 0.65, 6, 'crate'],
    [1.3, 1.3, 1.3, 24, 0.65, 4.7, 'crate'],
    [1.3, 1.3, 1.3, -6, 0.65, -4, 'crate'],
    [1.3, 1.3, 1.3, 6, 0.65, -4, 'crate'],
    [1.3, 1.3, 1.3, 0, 0.65, -13, 'crate'],
    [1.3, 1.3, 1.3, -12, 0.65, 18, 'crate'],
    [1.3, 1.3, 1.3, 12, 0.65, 18, 'crate'],
    [3.4, 1.1, 1.2, -2, 0.55, 14, 'crate'],
    [3.4, 1.1, 1.2, -28, 0.55, -8, 'crate'],
    [3.4, 1.1, 1.2, 28, 0.55, -8, 'crate'],
    [1.3, 1.3, 1.3, -20, 0.65, -19, 'crate'],
    [1.3, 1.3, 1.3, 20, 0.65, -19, 'crate'],
  ];
  for (const args of crates) box(...args);

  // Dusk light: a low amber sun from the west, a violet sky dome, a cool fill.
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 30, 95);
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a76b8'), new THREE.Color(PALETTE.sandDark), 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.dusk), 2.4);
  sun.position.set(-28, 16, 14);
  sun.target.position.set(6, 0, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a86c8'), 0.5);
  fill.position.set(20, 12, 18);
  scene.add(fill);

  return { colliders, shootables, mapRects, bounds: BOUNDS, group };
}

// Slab test: does the segment from a to b cross any world box? Used for bot sight.
export function segmentBlocked(colliders, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  for (const box of colliders) {
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    const mins = [box.min.x, box.min.y, box.min.z];
    const maxs = [box.max.x, box.max.y, box.max.z];
    const origins = [a.x, a.y, a.z];
    const dirs = [dx, dy, dz];
    for (let axis = 0; axis < 3; axis += 1) {
      const dir = dirs[axis];
      if (Math.abs(dir) < 1e-9) {
        if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) { hit = false; break; }
      } else {
        let near = (mins[axis] - origins[axis]) / dir;
        let far = (maxs[axis] - origins[axis]) / dir;
        if (near > far) { const tmp = near; near = far; far = tmp; }
        if (near > t0) t0 = near;
        if (far < t1) t1 = far;
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}
