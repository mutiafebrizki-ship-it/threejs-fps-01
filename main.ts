// SANDLINE — a three.js tactical FPS entry for bounty threejs-fps-01 (Node 22, standard
// library only). The game is this directory's game/ folder: plain static files the browser
// loads as ES modules, three.js 0.187.0 vendored under game/vendor. This program hands the
// entry in: it copies game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
// Screenshots live in screenshots/ (the first by name is the cover); retake them with the
// shot script and the ?scene= menu, fight, plant and score setups in game/src/main.js.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse (more than 4 screenshots or one over 256
// KiB; more than 993 files in game/ or 48 MiB of game files, in all: game/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// A line for the humans running this by hand: the dossier is written, the entry is ready.
// The size is printed because the gate caps dossier.json at 1.5 MiB — a number that has
// quietly crept past the cap before is caught here, not at submission.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`SANDLINE dossier written to ${out}/dossier.json (${dossierBytes} bytes)`);
