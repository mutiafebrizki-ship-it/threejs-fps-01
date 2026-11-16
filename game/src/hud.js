// The DOM HUD: health, ammo, timer, score, money, kill feed, minimap, crosshair, hit
// marker, plant and defuse bar, buy menu, scoreboard and the menu overlays. It never
// touches the simulation; main.js pushes numbers in and reads button clicks out. The
// minimap is a top-down sketch of the yard drawn from the world's own wall list.
import { PALETTE } from './palette.js';

const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'Yard 7, dusk. Five attackers, five defenders, one spike. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  down: {
    title: 'You are down',
    copy: 'Your team fights on without you. The round continues — watch it play out, and you will be back next round.',
    action: 'Spectate',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(world, callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoWeapon = $('ammo-weapon');
  const ammoNades = $('ammo-nades');
  const timerText = $('timer-text');
  const timerPhase = $('timer-phase');
  const scoreAtk = $('score-atk');
  const scoreDef = $('score-def');
  const roundNum = $('round-num');
  const moneyVal = $('money-val');
  const feedEl = $('feed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const channel = $('channel');
  const channelLabel = $('channel-label');
  const channelFill = $('channel-fill');
  const bannerEl = $('banner');
  const damageEl = $('damage');
  const buyEl = $('buy');
  const scoreboardEl = $('scoreboard');
  const scoreRows = $('score-rows');
  const muteEl = $('muted');
  const mapCanvas = $('minimap');
  const mapCtx = mapCanvas.getContext('2d');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastMoney = -1;
  let lastFeedKey = '';

  play.addEventListener('click', () => callbacks.onPlay());
  buyEl.querySelectorAll('[data-buy]').forEach((button) => {
    button.addEventListener('click', () => callbacks.onBuy(button.dataset.buy));
  });

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === lastHealth) return;
      lastHealth = v;
      healthFill.style.width = `${v}%`;
      healthNum.textContent = String(v);
      healthFill.style.background = v > 50 ? PALETTE.ally : v > 25 ? PALETTE.accent : PALETTE.danger;
    },
    setAmmo(mag, reserve, nades, weaponName) {
      const key = `${mag}/${reserve}/${nades}/${weaponName}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoWeapon.textContent = weaponName;
      ammoNades.textContent = nades > 0 ? `◉ ${nades}` : '○ 0';
    },
    setTimer(seconds, phase) {
      const key = `${fmtTime(seconds)}|${phase}`;
      if (key === lastTimer) return;
      lastTimer = key;
      timerText.textContent = fmtTime(seconds);
      timerPhase.textContent = phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND' : phase === 'menu' ? 'YARD 7' : phase.toUpperCase();
      timerText.style.color = seconds <= 10 && phase === 'live' ? PALETTE.danger : PALETTE.ink;
    },
    setScore(atk, def, round) {
      const key = `${atk}-${def}-${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreAtk.textContent = String(atk);
      scoreDef.textContent = String(def);
      roundNum.textContent = `ROUND ${round}`;
    },
    setMoney(m) {
      const v = Math.round(m);
      if (v === lastMoney) return;
      lastMoney = v;
      moneyVal.textContent = `$${v}`;
    },
    setFeed(entries) {
      const key = entries.map((e) => `${e.killer}>${e.victim}${e.headshot ? '!' : ''}`).join('|');
      if (key === lastFeedKey) return;
      lastFeedKey = key;
      feedEl.innerHTML = '';
      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'feed-row';
        row.innerHTML = `<span class="feed-killer">${entry.killer}</span> <span class="feed-x">${entry.headshot ? '◉' : '✕'}</span> <span class="feed-victim">${entry.victim}</span>`;
        feedEl.appendChild(row);
      }
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageEl.classList.add('on');
      setTimeout(() => damageEl.classList.remove('on'), 180);
    },
    banner(text) {
      bannerEl.textContent = text;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), 2600);
    },
    showChannel(label, progress) {
      channel.hidden = false;
      channelLabel.textContent = label;
      channelFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hideChannel() {
      channel.hidden = true;
    },
    showBuy(open, money, owned) {
      buyEl.hidden = !open;
      if (!open) return;
      buyEl.querySelectorAll('[data-buy]').forEach((button) => {
        const id = button.dataset.buy;
        const price = Number(button.dataset.price);
        const ownedAlready = id !== 'grenade' && owned[id];
        button.disabled = ownedAlready || money < price;
        button.querySelector('.buy-state').textContent = ownedAlready ? 'OWNED' : `$${price}`;
      });
    },
    showScoreboard(open, players, score) {
      scoreboardEl.hidden = !open;
      if (!open) return;
      scoreRows.innerHTML = '';
      const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      for (const p of sorted) {
        const row = document.createElement('tr');
        row.className = p.team === 'atk' ? 'team-atk' : 'team-def';
        row.innerHTML = `<td>${p.name}${p.isPlayer ? ' (you)' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td>`;
        scoreRows.appendChild(row);
      }
      $('scoreboard-title').textContent = `Attackers ${score.atk} — ${score.def} Defenders`;
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'roundEnd') copy.textContent = detail || text.copy;
      else if (mode === 'matchEnd') copy.textContent = detail || text.copy;
      else copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    setMuted(m) {
      muteEl.hidden = !m;
    },
    drawMinimap(player, bots, spike) {
      const ctx = mapCtx;
      const w = mapCanvas.width;
      const h = mapCanvas.height;
      const sx = w / 66;
      const sz = h / 50;
      const toX = (x) => (x + 33) * sx;
      const toZ = (z) => (z + 25) * sz;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(20, 22, 28, 0.82)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5d6b73';
      for (const rect of world.mapRects) {
        ctx.fillRect(toX(rect.x), toZ(rect.z), Math.max(1, rect.w * sx), Math.max(1, rect.d * sz));
      }
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.accent;
      ctx.fillText('A', toX(-24), toZ(-16));
      ctx.fillStyle = '#8fd8d2';
      ctx.fillText('B', toX(24), toZ(-16));
      if (spike.status === 'dropped' || spike.status === 'planted') {
        ctx.fillStyle = PALETTE.accent;
        ctx.beginPath();
        ctx.arc(toX(spike.pos.x), toZ(spike.pos.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const bot of bots) {
        if (!bot.alive) continue;
        ctx.fillStyle = bot.team === 'atk' ? PALETTE.ally : PALETTE.enemy;
        ctx.beginPath();
        ctx.arc(toX(bot.pos.x), toZ(bot.pos.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // The player: a white wedge pointing where they look.
      const px = toX(player.position.x);
      const pz = toZ(player.position.z);
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw)) + Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
