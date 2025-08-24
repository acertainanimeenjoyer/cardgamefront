// src/services/gameService.js
import apiService from './apiService';

// ---------- helpers ----------
const isOID   = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
const toOID   = (v) => (v == null ? undefined : String(v));
const toOIDArr = (arr) => Array.isArray(arr) ? arr.map(toOID).filter(isOID) : [];

const clean = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
};

const normEffects = (eff) => {
  const normSide = (side) => (Array.isArray(side) ? side.map(e => clean({
    type: String(e?.type ?? ''),
    target: e?.target != null ? String(e.target) : undefined,
    power: Number(e?.power ?? e?.amount ?? 0) || 0,
    remaining: Number(e?.remaining ?? 0) || 0,
    precedence: Number(e?.precedence ?? 0) || 0,
  })) : []);
  return clean({ player: normSide(eff?.player), enemy: normSide(eff?.enemy) });
};

const normField = (onField) => {
  const normSide = (side) => (Array.isArray(side) ? side.map(f => clean({
    instanceId:      f?.instanceId != null ? String(f.instanceId) : undefined,
    owner:           typeof f?.owner === 'string' ? f.owner : undefined,
    // KEEP the full card snapshot (name, types, potency, defense, abilities, etc.)
    card:            (f && typeof f.card === 'object') ? f.card : undefined,
    turnsRemaining:  Number(f?.turnsRemaining ?? 0) || 0,
    link:            typeof f?.link === 'string' ? f.link : undefined,
    scheduleState:   (f?.scheduleState && typeof f.scheduleState === 'object') ? f.scheduleState : undefined,
  })) : []);
  return clean({ player: normSide(onField?.player), enemy: normSide(onField?.enemy) });
};

const normRosterMap = (rm) => {
  if (!rm || typeof rm !== 'object') return undefined;
  const out = {};
  for (const [id, v] of Object.entries(rm)) {
    if (!isOID(id)) continue;
    if (v && typeof v === 'object' && v.name) out[id] = { name: String(v.name) };
    else if (typeof v === 'string')           out[id] = { name: v };
  }
  return Object.keys(out).length ? out : undefined;
};
// Mirror hp / hpRemaining so the controller always gets numeric hp
const bridgeHp = (stats) => {
  if (!stats || typeof stats !== 'object') return undefined;
  const out = { ...stats };
  const hpLike = (v) => (typeof v === 'number' && !Number.isNaN(v)) ? v : undefined;
  // Prefer explicit hp, else fall back to hpRemaining
  const hp = hpLike(out.hp) ?? hpLike(out.hpRemaining);
  if (hp !== undefined) {
    out.hp = hp;
    // keep both for compatibility (harmless on BE)
    out.hpRemaining = hp;
  }
  return out;
};

// Only whitelist fields the SavedGame schema actually knows about.
const sanitizeSave = (s) => {
  const payload = {};

  // identifiers / indices
  if (s?.campaignId)  payload.campaignId = toOID(s.campaignId);
  if (typeof s?.roomIndex === 'number') payload.roomIndex = s.roomIndex;

  // money — only include if explicitly a number
  if (typeof s?.money === 'number' && !Number.isNaN(s.money)) {
    payload.money = s.money;
  }

  // combat-ish state (plain JSON only)
  if (s?.activeEffects) payload.activeEffects = normEffects(s.activeEffects);
  if (s?.onField)       payload.onField       = normField(s.onField);

  // optional enemy snapshot (if your schema supports it; safe to omit otherwise)
  if (s?.enemy) {
    const enemy = {};
    if (s.enemy._id) enemy._id = toOID(s.enemy._id);
    if (s.enemy.stats) {
      const { hp, sp, maxSp } = s.enemy.stats;
      enemy.stats = clean({
        hp: Number(hp ?? 0) || 0,
        sp: Number(sp ?? 0) || 0,
        maxSp: Number(maxSp ?? 0) || 0,
      });
    }
    if (Object.keys(enemy).length) payload.enemy = enemy;
  }

  return clean(payload);
};

// ---------- API calls ----------
const playTurn = async (body, token) => {
  const {
    selectedCards, playerStats, enemyId, enemyStats, action,
    hand, deck, discardPile, enemyHand, enemyDeck, enemyDiscard,
    activeEffects, onField, retargetChoices, negationTarget,
    campaignId, roomId, ...rest
  } = body || {};

  // Only include fields that are actually present; do not overwrite server state with [] stubs.
  const payload = clean({
    campaignId: campaignId ?? undefined,
    roomId: roomId ?? undefined,

    // If action is missing, infer from selection
    action: typeof action === 'string'
      ? action
      : (Array.isArray(selectedCards) && selectedCards.length ? 'play' : 'skip'),

    // Intent
    selectedCards: Array.isArray(selectedCards) ? selectedCards : undefined,

    // Echo CURRENT piles so BE can reconcile without reseeding
    hand:        Array.isArray(hand)        ? hand        : undefined,
    deck:        Array.isArray(deck)        ? deck        : undefined,
    discardPile: Array.isArray(discardPile) ? discardPile : undefined,
    enemyHand:   Array.isArray(enemyHand)   ? enemyHand   : undefined,
    enemyDeck:   Array.isArray(enemyDeck)   ? enemyDeck   : undefined,
    enemyDiscard:Array.isArray(enemyDiscard)? enemyDiscard: undefined,

    // Echo persistent state so MH schedules tick correctly
    onField:       onField ? normField(onField) : undefined,
    activeEffects: activeEffects ? normEffects(activeEffects) : undefined,

    // Stats/ids
    playerStats: playerStats || undefined,
    enemyId:     enemyId     || undefined,
    enemyStats:  enemyStats  || undefined,

    // Targeting/negation from UI
    retargetChoices: Array.isArray(retargetChoices) ? retargetChoices : undefined,
    negationTarget:  negationTarget !== undefined ? negationTarget : undefined,

    // allow seed or other flags via ...rest
    ...rest,
  });

  //debug to verify what you actually send:
  console.debug('[FE][REQ][TURN] cleaned payload', {
    action: payload.action,
    sc: payload.selectedCards?.length || 0
  });
  // Normalize selectedCards to instanceIds only
  if (Array.isArray(payload.selectedCards)) {
    payload.selectedCards = payload.selectedCards
      .map(c => (c && typeof c === 'object' ? c.instanceId : c))
      .filter(Boolean);
  }
  const res = await apiService.request('/api/game/play', 'POST', payload, token);
  // Standardize shape for the frontend (GamePage’s pickResult handles both)
  return res?.data ?? res;
};


export const saveState = async (state, token) => {
  // resolve any functional values into plain JSON first
  const base = (state && typeof state === 'object') ? state : {};
  const resolved = Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, (typeof v === 'function' ? v(base) : v)])
  );

  const payload = sanitizeSave(resolved);
  return apiService.request('/api/game/save', 'POST', payload, token);
};

const loadState = async (token) =>
  apiService.request('/api/game/load', 'GET', undefined, token);

async function patchState(partial, token) {
  return apiService.request('/api/game/save', 'PATCH', partial, token);
}

async function clearCheckpoint(token) {
  // 1) Preferred: treat null as "delete"
  try {
    return await apiService.request('/api/game/save', 'PATCH', { checkpoint: null }, token);
  } catch (err) {
    // 2) Fallback: some controllers prefer $unset semantics
    try {
      return await apiService.request('/api/game/save', 'PATCH', { $unset: { checkpoint: true } }, token);
    } catch (err2) {
      // rethrow the original; the second attempt didn't help
      throw err;
    }
  }
}
const gameService = { playTurn, saveState, loadState, patchState, clearCheckpoint };
export default gameService;
