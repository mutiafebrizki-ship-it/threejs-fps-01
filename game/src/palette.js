// The look plan for SANDLINE, in one place: a dusk desert freight yard. Warm sand and
// rusted steel under a violet dusk sky, one amber accent for the spike and the HUD.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#2b2340',
  dusk: '#e07840',
  sand: '#c9a06a',
  sandDark: '#a67c4e',
  rust: '#8a4a2c',
  steel: '#5d6b73',
  steelDark: '#39434a',
  crate: '#7d6a4a',
  containerA: '#a3542f',
  containerB: '#3f6d6b',
  ink: '#f2ead9',
  muted: '#b3a58f',
  accent: '#ffb347',
  danger: '#ff5a3c',
  ally: '#7fc97f',
  enemy: '#e05a5a',
};

export function shade(name) {
  return PALETTE[name];
}
