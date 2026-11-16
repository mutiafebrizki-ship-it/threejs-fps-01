# SANDLINE — Yard 7

[![threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/competitions/threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/mutiafebrizki-ship-it/threejs-fps-01/rank.svg)](https://make.fun/competitions/threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/mutiafebrizki-ship-it/threejs-fps-01/reward.svg)](https://make.fun/competitions/threejs-fps-01)

A round-based tactical FPS in the browser, built with three.js. Dusk in a desert freight
yard — Yard 7 — where five attackers push three lanes against five defenders, carrying a
spike to one of two bombsites. First team to 5 rounds takes the match.

## How a round plays

- **Attackers** carry the spike. Hold **E** inside site A or B to plant it (3.5 s). Once
  planted, it detonates after 35 seconds unless a defender defuses it (4 s on a clear site).
- **Defenders** hold the lanes and the sites, rotate to a plant, and defuse when the site
  is clear.
- A round also ends when one team is eliminated, or when the timer runs out.
- **Money** is earned for kills and round wins, and spent in the buy menu between rounds
  on a rifle, an SMG, or grenades. You start with a pistol.

## Gunplay

Three guns — pistol, SMG, rifle — plus a fragmentation grenade. Headshots deal several
times body damage. Every shot adds recoil and bloom, movement widens the spread, and
crouching steadies your aim, so stopping to shoot pays. Bots walk lanes, hold angles,
react to gunfire they hear, and rotate to the spike.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Click | Fire |
| R | Reload |
| 1 / 2 / 3 | Pistol / SMG / Rifle |
| G | Throw grenade |
| E (hold) | Plant the spike |
| B | Buy menu (buy phase) |
| Ctrl | Crouch |
| Space | Jump |
| Tab | Scoreboard |
| M | Mute |

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080>. No build step, no network requests — the game is
static files under `game/`, with three.js 0.187.0 vendored in `game/vendor/three/`.

## Shots

The four screenshots in `screenshots/` are deterministic captures of the game's own
scenes: the menu, a mid-lane fight, a plant on site A, and the end-of-match scoreboard
(`?scene=menu|fight|plant|score` with a fixed seed).

## Layout

- `game/src/main.js` — boot, fixed 60 Hz loop, shooting, scene setups
- `game/src/world.js` — the Yard 7 map, colliders, line-of-sight test
- `game/src/player.js` — movement, collision, crouch and jump
- `game/src/bots.js` — bot movement, sight, bursts, routes and objectives
- `game/src/weapons.js` — the three guns, view models, grenades
- `game/src/match.js` — rounds, timer, economy, spike, kill feed
- `game/src/hud.js` — health, ammo, timer, score, minimap, buy menu, scoreboard
- `game/src/audio.js` — WebAudio-synthesised sounds, no audio files
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/palette.js` — the dusk desert look, in one place
