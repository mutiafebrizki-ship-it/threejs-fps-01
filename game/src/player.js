// The player's body: acceleration, friction, gravity, crouch and jump, resolved as a
// capsule-ish box against the world's colliders one axis at a time. A wall can stop the
// player but never swallow them; the floor is found by the same test, looking down.
import * as THREE from 'three';

const RADIUS = 0.34;
const TALL = 1.72;
const SHORT = 1.12;
const EYE_TALL = 1.6;
const EYE_SHORT = 1.02;
const WALK = 5.4;
const CROUCH_WALK = 2.5;
const PUSH = 44;
const AIR_PUSH = 10;
const DRAG = 9.5;
const FALL = 21;
const HOP = 6.4;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 20),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_TALL,
    height: TALL,
    crouched: false,
    grounded: true,
    health: 100,
    alive: true,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift trims the box's top and bottom out of the sideways tests, so standing on the
  // ground is not mistaken for walking into a wall.
  function blocked(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const solid of colliders) {
      if (probe.intersectsBox(solid)) return solid;
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0021) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function kick(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!body.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('ControlRight');
    if (wantCrouch && !body.crouched) {
      body.crouched = true;
      body.height = SHORT;
    } else if (!wantCrouch && body.crouched && !blocked(body.position.x, body.position.y, body.position.z, TALL, 0.02)) {
      body.crouched = false;
      body.height = TALL;
    }
    const eyeGoal = body.crouched ? EYE_SHORT : EYE_TALL;
    body.eye += (eyeGoal - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const topSpeed = body.crouched ? CROUCH_WALK : WALK;
    const ease = Math.min(1, (body.grounded ? PUSH : AIR_PUSH) * dt / topSpeed);
    body.velocity.x += (wish.x * topSpeed - body.velocity.x) * ease;
    body.velocity.z += (wish.z * topSpeed - body.velocity.z) * ease;
    if (body.grounded && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - DRAG * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (keys.has('Space') && body.grounded) {
      body.velocity.y = HOP;
      body.grounded = false;
    }
    body.velocity.y -= FALL * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!blocked(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!blocked(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.grounded = false;
    const under = blocked(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (under && body.velocity.y <= 0) {
      body.position.y = under.max.y;
      body.velocity.y = 0;
      body.grounded = true;
    } else if (under) {
      body.position.y = under.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.grounded = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
    // Stay inside the yard.
    body.position.x = Math.max(-31.4, Math.min(31.4, body.position.x));
    body.position.z = Math.max(-23.4, Math.min(23.4, body.position.z));
  }

  return {
    state: body,
    step,
    look,
    kick,
    speed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    reset(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      body.yaw = yaw;
      body.pitch = 0;
      body.health = 100;
      body.alive = true;
      body.crouched = false;
      body.height = TALL;
      body.eye = EYE_TALL;
    },
  };
}
