// The match, kept in one state object: rounds, the timer, the money, the spike and the
// scoreboard. Nothing here touches the DOM or the scene; main.js reads this state and
// pushes it into the HUD, and the bots read the spike through the step context.
import * as THREE from 'three';
import { SITES } from './world.js';

const WIN_ROUNDS = 5;
const ROUND_SECONDS = 100;
const BUY_SECONDS = 12;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 4;
const SPIKE_FUSE = 35;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;

export function createMatch(bots) {
  const players = [
    { name: 'You', team: 'atk', kills: 0, deaths: 0, isPlayer: true },
    ...bots.map((bot) => ({ name: bot.name, team: bot.team, kills: 0, deaths: 0, bot })),
  ];

  const state = {
    phase: 'menu',
    round: 1,
    score: { atk: 0, def: 0 },
    timer: ROUND_SECONDS,
    money: 800,
    spike: {
      status: 'carried', // carried | dropped | planted | gone
      carrier: 'player',
      site: null,
      pos: new THREE.Vector3(0, 0, 20),
      plantProgress: 0,
      defuseProgress: 0,
      plantedAt: 0,
      beepAt: 0,
    },
    feed: [],
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    elapsed: 0,
  };

  function findPlayer(name) {
    return players.find((p) => p.name === name);
  }

  function addFeed(killer, victim, headshot) {
    state.feed.unshift({ killer, victim, headshot, t: state.elapsed });
    if (state.feed.length > 6) state.feed.pop();
  }

  function recordKill(killerName, victimName, headshot) {
    const killer = findPlayer(killerName);
    const victim = findPlayer(victimName);
    if (killer) killer.kills += 1;
    if (victim) victim.deaths += 1;
    addFeed(killerName, victimName, headshot);
    if (killer && killer.isPlayer) state.money += KILL_REWARD;
  }

  function nearestSite(x, z) {
    const da = Math.hypot(x - SITES.A.x, z - SITES.A.z);
    const db = Math.hypot(x - SITES.B.x, z - SITES.B.z);
    return da <= db ? 'A' : 'B';
  }

  function siteOf(x, z) {
    for (const [key, site] of Object.entries(SITES)) {
      if (Math.hypot(x - site.x, z - site.z) < site.r) return key;
    }
    return null;
  }

  function endRound(winner, reason) {
    if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundReason = reason;
    state.score[winner] += 1;
    state.money += winner === 'atk' ? WIN_REWARD : LOSS_REWARD;
    if (state.score[winner] >= WIN_ROUNDS) {
      state.phase = 'matchEnd';
      state.matchWinner = winner;
    }
  }

  return {
    state,
    players,
    startMatch() {
      state.phase = 'buy';
      state.round = 1;
      state.score = { atk: 0, def: 0 };
      state.timer = BUY_SECONDS;
      state.money = 800;
      state.roundWinner = null;
      state.roundReason = '';
      state.matchWinner = null;
      state.feed = [];
      for (const p of players) { p.kills = 0; p.deaths = 0; }
      this.resetSpike('player');
    },
    startRound() {
      state.phase = 'buy';
      state.timer = BUY_SECONDS;
      state.roundWinner = null;
      state.roundReason = '';
      this.resetSpike('player');
    },
    resetSpike(carrier) {
      const spike = state.spike;
      spike.status = 'carried';
      spike.carrier = carrier;
      spike.site = null;
      spike.plantProgress = 0;
      spike.defuseProgress = 0;
      spike.plantedAt = 0;
    },
    dropSpike(x, z) {
      const spike = state.spike;
      spike.status = 'dropped';
      spike.carrier = null;
      spike.pos.set(x, 0.4, z);
      spike.plantProgress = 0;
    },
    pickUpSpike(carrier) {
      const spike = state.spike;
      spike.status = 'carried';
      spike.carrier = carrier;
      spike.plantProgress = 0;
    },
    // Called every fixed step while someone holds the plant key inside a site.
    advancePlant(dt, planter, x, z) {
      const spike = state.spike;
      if (spike.status !== 'carried') return false;
      const site = siteOf(x, z);
      if (!site) {
        spike.plantProgress = 0;
        return false;
      }
      spike.site = site;
      spike.plantProgress += dt / PLANT_SECONDS;
      if (spike.plantProgress >= 1) {
        spike.status = 'planted';
        spike.plantedAt = state.elapsed;
        spike.pos.set(SITES[site].x, 0.4, SITES[site].z);
        spike.plantProgress = 0;
        return true;
      }
      return false;
    },
    // Called every fixed step while a defender holds the defuse key at a planted spike.
    advanceDefuse(dt) {
      const spike = state.spike;
      if (spike.status !== 'planted') return false;
      spike.defuseProgress += dt / DEFUSE_SECONDS;
      if (spike.defuseProgress >= 1) {
        spike.status = 'gone';
        spike.defuseProgress = 0;
        endRound('def', 'Spike defused');
        return true;
      }
      return false;
    },
    cancelChannel() {
      state.spike.plantProgress = 0;
      state.spike.defuseProgress = 0;
    },
    recordKill,
    nearestSite,
    siteOf,
    tick(dt, alive) {
      state.elapsed += dt;
      if (state.phase === 'buy') {
        state.timer -= dt;
        if (state.timer <= 0) {
          state.phase = 'live';
          state.timer = ROUND_SECONDS;
        }
        return;
      }
      if (state.phase !== 'live') return;
      state.timer -= dt;
      const spike = state.spike;
      if (spike.status === 'planted') {
        if (state.elapsed - spike.plantedAt >= SPIKE_FUSE) {
          spike.status = 'gone';
          endRound('atk', 'Spike detonated');
          return;
        }
      } else if (state.timer <= 0) {
        endRound('def', 'Time expired');
        return;
      }
      if (alive.atk === 0) {
        if (spike.status === 'planted') return; // defenders must still defuse
        endRound('def', 'Attackers eliminated');
      } else if (alive.def === 0) {
        endRound('atk', 'Defenders eliminated');
      }
    },
    nextRound() {
      if (state.phase === 'matchEnd') return false;
      state.round += 1;
      this.startRound();
      return true;
    },
    get plantSeconds() { return PLANT_SECONDS; },
    get defuseSeconds() { return DEFUSE_SECONDS; },
    get spikeFuse() { return SPIKE_FUSE; },
    get buySeconds() { return BUY_SECONDS; },
    get roundSeconds() { return ROUND_SECONDS; },
  };
}
