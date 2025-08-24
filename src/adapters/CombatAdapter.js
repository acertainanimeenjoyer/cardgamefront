// src/adapters/CombatAdapter.js
/**
 * Normalize whatever the backend returns into a shape the combat board wants.
 * - Supports single or multiple enemies (up to 4)
 * - Supports flat or per-enemy effects/field payloads
 */
export function adaptEffects(effects) {
  const norm = (arr) => Array.isArray(arr) ? arr : (arr ? [arr] : []);
  const player = norm(effects?.player);
  // enemy can be: [], ["..."], or [["..."], ["..."], ...]
  let enemy = effects?.enemy ?? [];
  if (!Array.isArray(enemy)) enemy = [enemy];
  if (enemy.length && enemy.every(e => typeof e === 'string')) enemy = [enemy];
  return { player, enemy };
}

export function adaptField(onField) {
  // Expect something like { player: ["Card#id(tRem=2)"], enemy: [...] }
  const toFive = (items=[]) => {
    const arr = Array.isArray(items) ? items : [];
    const pad = new Array(Math.max(0, 5 - arr.length)).fill(null);
    return arr.slice(0,5).concat(pad);
  };
  const player = toFive(onField?.player);
  let enemy = onField?.enemy ?? [];
  if (!Array.isArray(enemy)) enemy = [enemy];
  // ensure each enemy row has 5 slots
  enemy = enemy.map(toFive);
  if (enemy.length === 0) enemy = [toFive([])]; // at least one
  return { player, enemy };
}

export function adaptEnemies(enemiesFromRoom, fallbackEnemyDoc) {
  // Accept array of enemy docs or a single doc
  const list = Array.isArray(enemiesFromRoom) ? enemiesFromRoom
             : (fallbackEnemyDoc ? [fallbackEnemyDoc] : []);
  // Pad to 4 so UI can reserve circles
  const max = 4;
  const padded = [...list];
  while (padded.length < max) padded.push(null);
  return padded.slice(0, max);
}

export function quickStatsDelta(aggregateBuffs = {}) {
  // expects something like { attackPower: +2, physicalPower: 0, supernaturalPower: 0 }
  return {
    attackPower: aggregateBuffs.attackPower || 0,
    physicalPower: aggregateBuffs.physicalPower || 0,
    supernaturalPower: aggregateBuffs.supernaturalPower || 0,
  };
}

export function buildPlayedFeed(entries = []) {
  // Accepts array of strings or {side,text}
  return entries.map(e => {
    if (typeof e === 'string') return { side: 'player', text: e };
    if (!e) return { side: 'player', text: '' };
    return { side: e.side || 'player', text: e.text || String(e) };
  });
}
