import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import campaignService from '../services/campaignService';
import gameService from '../services/gameService';
import ActionButtons from '../components/ActionButtons';
import LootRoom from '../rooms/LootRoom';
import MerchantRoom from '../rooms/MerchantRoom';
import EventRoom from '../rooms/EventRoom';
import '../styles/GamePage.css';
import '../styles/ModernGameUI.css';
import MultiEnemyRow from '../components/combat/MultiEnemyRow';
import PartyRow from '../components/combat/PartyRow';
import CombatLogDrawer from '../components/combat/CombatLogDrawer';
import { makeEnemyDetails, makePlayerDetails } from '../components/combat/PanelAdapters';
import CardTile from '../components/cards/CardTile';
import '../components/cards/CardTile.css';
import '../styles/CombatLayout.css';
import CardDescDialog from '../components/CardDescDialog';
const normalizeRoom = (r) => {
  if (!r || typeof r !== 'object') return r;
  const id = r._id || r.id;

  // enemies[] might be an array of objects (with _id) or an array of raw string ids
  const firstFromEnemies = Array.isArray(r.enemies) && r.enemies.length
    ? (typeof r.enemies[0] === 'string'
        ? r.enemies[0]
        : (r.enemies[0]?._id || r.enemies[0]?.id))
    : null;

  const enemyId =
    r.enemyId
    || (Array.isArray(r.enemyIds) && r.enemyIds.length ? r.enemyIds[0] : null)
    || firstFromEnemies;

  return { ...r, _id: id, enemyId };
};

// --- DEBUG ---
const DEBUG = true;
const dlog = (...args) => { if (DEBUG) console.log(...args); };

/* ===========================
   Tiny FieldTable component
   =========================== */
const FieldTable = ({ enemyItems = [], playerItems = [] }) => {
  const MAX = 4;
  const row = (items) => {
    const filled = Array.isArray(items) ? items.slice(0, MAX) : [];
    const empties = Math.max(0, MAX - filled.length);
    return [...filled, ...Array(empties).fill(null)];
  };

  const enemyRow = row(enemyItems);
  const playerRow = row(playerItems);

  return (
    <div className="field-table">
      <div className="ft-row enemy">
        {enemyRow.map((it, i) => (
          <div key={`e-${i}-${it?.instanceId ?? 'empty'}`} className={`ft-cell ${it ? 'has-card' : 'empty'}`}>
            {it && <CardTile card={it.card || { name: 'Card' }} variant="mini" />}
            {it && <div className="slot-turns">{Math.max(0, it.turnsRemaining)}T</div>}
          </div>
        ))}
      </div>

      <div className="ft-row player">
        {playerRow.map((it, i) => (
          <div key={`p-${i}-${it?.instanceId ?? 'empty'}`} className={`ft-cell ${it ? 'has-card' : 'empty'}`}>
            {it && <CardTile card={it.card || { name: 'Card' }} variant="mini" />}
            {it && <div className="slot-turns">{Math.max(0, it.turnsRemaining)}T</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ------- UI helpers: Effects + On-Field -------
function EffectsList({ title, effects }) {
  const list = Array.isArray(effects) ? effects : [];
  if (!list.length) return (
    <div className="panel small">
      <div className="panel-title">{title}</div>
      <div className="muted">None</div>
    </div>
  );
  return (
    <div className="panel small">
      <div className="panel-title">{title}</div>
      <ul className="fx-list">
        {list.map((e, i) => (
          <li key={i}>
            <b>{e.type}</b>
            {e.target ? <> <span className="muted">({e.target})</span></> : null}
            {typeof e.power === 'number' ? <> · {(e.type === 'Stats Down' ? '-' : '+')}{Math.abs(e.power)}</> : null}
            {typeof e.remaining === 'number' ? <> · {e.remaining}T</> : null}
            {typeof e.precedence === 'number' ? <> · p{e.precedence}</> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OnFieldList({ title, items }) {
  const arr = Array.isArray(items) ? items : [];
  return (
    <div className="panel small">
      <div className="panel-title">{title}</div>
      {arr.length === 0 ? <div className="muted">None</div> : (
        <ul className="fx-list">
          {arr.map((f, i) => (
            <li key={`${i}-${f?.instanceId ?? 'empty'}`}>
              <b>{f.card?.name || 'Card'}</b> · {Math.max(0, f.turnsRemaining)} turn(s) left
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ----------- INSTANCE ID SYSTEM -------------
let globalCardInstanceCounter = 1;
function createCardInstance(cardTemplate) {
  return { ...cardTemplate, instanceId: globalCardInstanceCounter++ };
}

// NEW: ensure cards have instanceId and dedupe by it
function ensureInstanceIds(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(c => (c && c.instanceId ? c : createCardInstance(c || {})));
}
function dedupeByInstanceId(cards) {
  const seen = new Set();
  return cards.filter(c => {
    const id = c?.instanceId;
    if (!id) return true;           // keep; it’ll be given one by ensureInstanceIds
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function normalizePile(cards) {
  return dedupeByInstanceId(ensureInstanceIds(cards));
}
// --- HP helpers (fallback from vitality) ---
const hpFromVitality = (obj) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const v = (typeof obj.vitality === 'number' ? obj.vitality
           : typeof obj.stats?.vitality === 'number' ? obj.stats.vitality
           : undefined);
  return (typeof v === 'number' && !Number.isNaN(v)) ? v * 100 : undefined;
};
// Also infer vitality from hp when hp is a clean multiple of 100
const vitFromHp = (obj) => {
  if (!obj || typeof obj !== 'object') return undefined;
  const hp = (typeof obj.hp === 'number' ? obj.hp
           : typeof obj.hpRemaining === 'number' ? obj.hpRemaining
           : undefined);
  if (typeof hp !== 'number' || Number.isNaN(hp) || hp <= 0) return undefined;
  const v = hp / 100;
  const r = Math.round(v);
  return (Math.abs(v - r) < 1e-9 && r >= 1) ? r : undefined;
};

// Ensure BOTH hp and vitality are present
const ensureStatsWithHpVit = (statsLike) => {
  const s = { ...(statsLike || {}) };
  // vitality first (so hpFromVitality can work)
  if (!(typeof s.vitality === 'number' && s.vitality > 0)) {
    const v = (typeof s.vitality === 'number' && s.vitality > 0) ? s.vitality : vitFromHp(s);
    if (typeof v === 'number') s.vitality = v;
  }
  if (!(typeof s.hp === 'number' && !Number.isNaN(s.hp))) {
    const hp = hpFromVitality(s) ?? (typeof s.hpRemaining === 'number' ? s.hpRemaining : undefined);
    if (typeof hp === 'number') s.hp = hp;
  }
  return s;
};

const ensureStatsWithHp = (statsLike) => {
  const s = { ...(statsLike || {}) };
  if (!(typeof s.hp === 'number' && !Number.isNaN(s.hp))) {
    const hp = hpFromVitality(s);
    if (typeof hp === 'number') s.hp = hp;
  }
  return s;
};

// --- Utility: Fisher–Yates shuffle ---
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DEFAULT_CAMPAIGN_LENGTH = 7;

const initialPlayerStats = {
  hp: 10000,
  speed: 5,
  defense: 10,
  sp: 3,
  maxSp: 5,
  attackPower: 10,
  supernaturalPower: 10,
  physicalPower: 10,
};

// --- STATIC PLAYER DECK & HAND (TESTING WITH NEW CARDS) ---
const deckCards = [
  {
    _id: '689ae154604cfd86904a919a',
    name: 'Blazing Flurry',
    type: ['Physical', 'Attack'],
    description: 'A rapid flurry of strikes.',
    potency: 8,
    spCost: 2,
    abilities: [
      {
        type: 'Multi-Hit',
        key: 'Flurry_MH',
        multiHit: {
          turns: 3,
          link: 'attack',
          overlap: 'inherit',
          schedule: { type: 'list', turns: [1, 2, 3] }
        }
      },
      { type: 'Durability Negation', key: 'DN_Auto', durabilityNegation: { auto: true } },
      { type: 'Stats Up', key: 'AtkUp', power: 2, duration: 2, linkedTo: 1 }
    ]
  },
  {
    _id: '689ae154604cfd86904a919b',
    name: 'Nullify Seal',
    type: ['Debuff', 'Utility'],
    description: 'Seal an enemy ability.',
    spCost: 2,
    abilities: [
      { type: 'Ability Negation', key: 'Seal', power: 1, duration: 1, precedence: 3 },
      { type: 'Ability Shield', key: 'SelfShield', duration: 1, precedence: 2 }
    ]
  },
  {
    _id: '689ae154604cfd86904a919c',
    name: 'Time Freeze',
    type: ['Utility', 'Debuff'],
    description: 'Briefly freeze the opponent.',
    spCost: 3,
    abilities: [{ type: 'Freeze', key: 'Freeze_1T', duration: 1, activationChance: 75 }]
  },
  {
    _id: '689ae154604cfd86904a919d',
    name: 'Curse Blade',
    type: ['Physical', 'Attack'],
    description: 'Cursed edge that bites over time.',
    potency: 6,
    spCost: 2,
    abilities: [
      { type: 'Curse', key: 'CurseDOT', power: 2, duration: 3 },
      {
        type: 'Durability Negation',
        key: 'DN_Sched',
        durabilityNegation: { auto: false, schedule: { type: 'list', turns: [2] } }
      },
      { type: 'Multi-Hit', key: 'FollowUps', multiHit: { turns: 2, link: 'attack', schedule: { type: 'random', times: 2 } } }
    ]
  },
  {
    _id: '689ae154604cfd86904a919e',
    name: 'Guardian Stance',
    type: ['Buff', 'Utility'],
    description: 'Assume a protective posture.',
    defense: 10,
    spCost: 1,
    abilities: [
      { type: 'Guard', key: 'Guard_1T', duration: 1, precedence: 2 },
      { type: 'Stats Up', key: 'DurUp', power: 3, duration: 2, linkedTo: 4 }
    ]
  },
  {
    _id: '689ae154604cfd86904a919f',
    name: 'Phoenix Feather',
    type: ['Buff'],
    description: 'Rise from the ashes.',
    spCost: 3,
    abilities: [{ type: 'Revive', key: 'SelfRevive50', power: 50, precedence: 5 }]
  },
  {
    _id: '689ae154604cfd86904a91a0',
    name: 'Instant Doom',
    type: ['Supernatural', 'Attack'],
    description: 'A forbidden word of ending.',
    potency: 1,
    spCost: 4,
    abilities: [{ type: 'Instant Death', key: 'ID_5pct', activationChance: 5, precedence: 4 }]
  },
  {
    _id: '689ae154604cfd86904a91a4',
    name: 'Frost Barrage',
    type: ['Utility', 'Debuff'],
    description: 'Repeated pulses of chilling magic.',
    spCost: 2,
    abilities: [
      { type: 'Freeze', key: 'FreezeTap', duration: 1, activationChance: 60, precedence: 2 },
      {
        type: 'Multi-Hit',
        key: 'RepeatFreeze',
        multiHit: { turns: 3, link: 'FreezeTap', overlap: 'separate', schedule: { type: 'list', turns: [1, 3] } }
      }
    ]
  },
  {
    _id: '689ae154604cfd86904a91a5',
    name: 'Piercing Thrust',
    type: ['Physical', 'Attack'],
    description: 'Armor-piercing strike.',
    potency: 10,
    spCost: 1,
    abilities: [
      { type: 'Durability Negation', key: 'DN_Once', durabilityNegation: { auto: false, schedule: { type: 'list', turns: [1] } } }
    ]
  },
  {
    _id: '689ae154604cfd86904a91a6',
    name: 'Mirror Shield',
    type: ['Buff', 'Utility'],
    description: 'Wards that foil hostile arts.',
    spCost: 2,
    abilities: [
      { type: 'Ability Shield', key: 'BigShield', duration: 2, precedence: 5 },
      { type: 'Guard', key: 'StandFirm', duration: 1, precedence: 3 }
    ]
  }
];

const initialHand = [
  {
    _id: '689ae154604cfd86904a919a',
    name: 'Blazing Flurry',
    type: ['Physical', 'Attack'],
    description: 'A rapid flurry of strikes.',
    potency: 8,
    spCost: 2,
    abilities: [
      {
        type: 'Multi-Hit',
        key: 'Flurry_MH',
        multiHit: {
          turns: 3,
          link: 'attack',
          overlap: 'inherit',
          schedule: { type: 'list', turns: [1, 2, 3] }
        }
      },
      { type: 'Durability Negation', key: 'DN_Auto', durabilityNegation: { auto: true } },
      { type: 'Stats Up', key: 'AtkUp', power: 2, duration: 2, linkedTo: 1 }
    ]
  },
  {
    _id: '689ae154604cfd86904a919e',
    name: 'Guardian Stance',
    type: ['Buff', 'Utility'],
    description: 'Assume a protective posture.',
    defense: 10,
    spCost: 1,
    abilities: [
      { type: 'Guard', key: 'Guard_1T', duration: 1, precedence: 2 },
      { type: 'Stats Up', key: 'DurUp', power: 3, duration: 2, linkedTo: 4 }
    ]
  },
  {
    _id: '689ae154604cfd86904a919b',
    name: 'Nullify Seal',
    type: ['Debuff', 'Utility'],
    description: 'Seal an enemy ability.',
    spCost: 2,
    abilities: [
      { type: 'Ability Negation', key: 'Seal', power: 1, duration: 1, precedence: 3 },
      { type: 'Ability Shield', key: 'SelfShield', duration: 1, precedence: 2 }
    ]
  }
];

// Instance all cards at module load!
const deckCardsWithInstance   = deckCards.map(createCardInstance);
const initialHandWithInstance = initialHand.map(createCardInstance);

// === fetch enemy
const fetchEnemyById = async (enemyId, token) => {
  if (!enemyId || !token) return null;
  const res = await fetch(`/api/enemies/${enemyId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return await res.json();
};

// ---------- Retarget UI ----------
function RetargetPrompts({ prompts, onPick, onConfirm, onCancel, selections, onInitDefault, onLabel }) {
  const list = Array.isArray(prompts) ? prompts : [];
  if (!list.length) return null;
  
  // ensure each has a default selected option
  useEffect(() => {
    list.forEach(p => {
      const pid = String(p.instanceId);
      if (!selections[pid] && Array.isArray(p.options) && p.options.length) {
        onInitDefault(pid, p.options[0]);
      }
    });
  }, [list, selections, onInitDefault]);

  const allChosen = list.every(p => selections[String(p.instanceId)]);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panel-title">Choose Targets</div>
      {list.map((p, i) => {
        const pid = String(p.instanceId);
        return (
          <div key={i} className="row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span>Card #{p.instanceId} needs a target:</span>
            <select
              value={JSON.stringify(selections[pid] || p.options[0])}
              onChange={e => onPick(pid, JSON.parse(e.target.value))}
            >
              {p.options.map((opt, j) => (
                <option key={j} value={JSON.stringify(opt)}>
                  {onLabel(opt)}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={!allChosen} onClick={onConfirm}>Confirm Targets</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const GamePage = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [handOpen, setHandOpen] = useState(false);
  const [campaign, setCampaign]       = useState([]);
  const [roomIndex, setRoomIndex]     = useState(0);
  const [roomType, setRoomType]       = useState('');
  const [loading, setLoading]         = useState(true);
  useEffect(() => {
    dlog('[FE][LOADING]', { loading });
  }, [loading]);
  const [combatResult, setCombatResult] = useState(null);
  const [descCard, setDescCard] = useState(null);
  // rolling combat log (kept across turns, capped)
  const [logEntries, setLogEntries] = useState([]);
  const [handBottom, setHandBottom] = useState(120);
  const [vw, setVw] = useState(window.innerWidth);
  const [gameState, setGameState] = useState({
    playerStats: { ...initialPlayerStats },
    deck: [], hand: [], discardPile: [],
    enemy: null,
    enemyDeck: [], enemyHand: [], enemyDiscard: [],
    selectedCards: [], gold: 0,
    activeEffects: { player: [], enemy: [] },
    onField: { player: [], enemy: [] },
    // NEW: retarget wiring
    retargetPrompts: [],
    retargetChoices: [],
  });
  const [rosterIds, setRosterIds] = useState([]);
  const [fxOpen, setFxOpen] = useState(null);
  // ===== Played cards feed (queue-based) =====
  const [playedQueue, setPlayedQueue] = useState([]); // [{ owner: 'player'|'enemy', cards: CardMinimal[] }]
  const [playedOwner, setPlayedOwner] = useState(null);
  // D) Played overlay state (must be declared before any effect reads it)
  const [playedOverlay, setPlayedOverlay] = useState([]);
  const [showPlayed, setShowPlayed] = useState(false);
  const enqueuePlayed = useCallback((owner, cards) => {
    const arr = Array.isArray(cards) ? cards : [];
    if (!arr.length) return;
    setPlayedQueue(q => [...q, { owner, cards: arr }]);
  }, []);
  useEffect(() => {
    if (!showPlayed && playedQueue.length) {
      const { owner, cards } = playedQueue[0];
      setPlayedOwner(owner);
      setPlayedOverlay(cards);
      setShowPlayed(true);
    }
  }, [playedQueue, showPlayed]);
  const confirmPlayedOverlay = useCallback(() => {
    // animate fly-out, then dequeue
    const panel = document.querySelector('.played-overlay');
    if (panel) panel.classList.add('fly-out');
    setTimeout(() => {
      setShowPlayed(false);
      setPlayedOverlay([]);
      setPlayedOwner(null);
      setPlayedQueue(q => q.slice(1));
      const p2 = document.querySelector('.played-overlay');
      if (p2) p2.classList.remove('fly-out');
    }, 800); // match CSS flyOut 800ms
  }, []);  
  const enemyHandPrevRef = useRef([]);
  const lastActionRef = useRef(null);
  const [turnInFlight, setTurnInFlight] = useState(false);
  useEffect(() => {
    enemyHandPrevRef.current = Array.isArray(gameState.enemyHand) ? gameState.enemyHand : [];
  }, [gameState.enemyHand]);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    const boardEl = document.querySelector('.board');
    const playerRowEl = document.querySelector('.ft-row.player'); // our 2x4 table’s player row
    if (!boardEl || !playerRowEl) return;

    const boardRect = boardEl.getBoundingClientRect();
    const rowRect   = playerRowEl.getBoundingClientRect();

    // distance from bottom of the board to the top of the player row (+ a small cushion)
    const bottomPx = Math.max(0, boardRect.bottom - rowRect.top + 12);
    setHandBottom(bottomPx);
  }, [
    vw,
    gameState.onField?.player?.length,   // row height may change if cards appear
    handOpen                              // recalc when opening
  ]);
  /** Show selected cards as "played" for ~1s, then fly out (~1s), then clear.
   *  TODO (backend): provide effect media (png/mp3) and per-card durations (≤5s).
   */
  const showPlayedCardsOverlay = (cards) => {
    setPlayedOverlay(cards);
    setShowPlayed(true);

    // 1) pop-in 1s (CSS animation)
    setTimeout(() => {
      // 2) optional effect window (TODO: from backend, <= 5s)
      // For now, just wait 0ms
      // 3) fly-to-deck (add class)
      const panel = document.querySelector('.played-overlay');
      if (panel) panel.classList.add('fly-out');

      setTimeout(() => {
        setShowPlayed(false);
        setPlayedOverlay([]);
        const p2 = document.querySelector('.played-overlay');
        if (p2) p2.classList.remove('fly-out');
      }, 1000); // fly-out ~1s
    }, 1000); // pop-in ~1s
  };
  const bootedRef = useRef(false);
  const { state } = useLocation();
  const bootRoom = state?.room || state?.current || state?.r || null;
  const bootCampaignId = state?.campaignId || state?.id || state?.campaign || null;
  // NEW: UI deltas (+buffs) for display only
  const [uiDelta, setUiDelta] = useState({
    player: { attackPower: 0, physicalPower: 0, supernaturalPower: 0 },
    enemy:  { attackPower: 0, physicalPower: 0, supernaturalPower: 0 }
  });

  // local selections for prompts before committing
  const [retargetSelections, setRetargetSelections] = useState({}); // { [instanceId]: targetRef }

  // drawHand: same for player & enemy (used only at setup)
  const drawHand = useCallback((deck, discardPile = []) => {
    const all    = [...deck, ...discardPile];
    const seen   = new Set();
    const unique = all.filter(c => {
      if (seen.has(c.instanceId)) return false;
      seen.add(c.instanceId);
      return true;
    });
    const newHand = unique.slice(0, 3);
    const newDeck = unique.slice(3);
    return { newHand, newDeck, newDiscard: [] };
  }, []);

  useEffect(() => {
    if (bootRoom?._id || bootCampaignId) {
      dlog('[DEFAULT][SKIP] nav boot present; skipping default campaign load');
      return;
    }
    if (bootedRef.current) {
      dlog('[DEFAULT][SKIP] already booted; skipping default campaign load');
      return;
    }
    const fetchCampaign = async () => {
      setLoading(true);
      try {
        dlog('[DEFAULT][LOAD] fetching default campaign');
        const res  = await campaignService.getDefaultCampaign(DEFAULT_CAMPAIGN_LENGTH, token);
        const camp = Array.isArray(res?.campaign) ? res.campaign
                : Array.isArray(res?.rooms)    ? res.rooms
                : Array.isArray(res)           ? res
                : [];
        const normalized = camp.map(normalizeRoom);
        dlog('[DEFAULT][SET] campaign rooms:', normalized.map(r => ({ i: r.index, type: r.type, enemyId: r.enemyId })));
        setCampaign(normalized);
        setRoomType(normalized[0]?.type ?? 'combat');
        setGameState(gs => ({
          ...gs,
          deck: [...deckCardsWithInstance],
          hand: [...initialHandWithInstance],
          discardPile: [],
          enemy: null,
          enemyDeck: [], enemyHand: [], enemyDiscard: [],
          activeEffects: { player: [], enemy: [] },
          onField: { player: [], enemy: [] },
          retargetPrompts: [],
          retargetChoices: [],
        }));
      } finally {
        setLoading(false);
      }
    };
    fetchCampaign();
  }, [token, bootRoom?._id, bootCampaignId]);

  // On room change: fetch enemy & init its deck/hand
  useEffect(() => {
    const updateRoomAndEnemy = async () => {
      const curr = campaign[roomIndex];
      setRoomType(curr?.type || 'combat');
      if (curr) {
        console.debug('[FE][ROOM]', {
          idx: roomIndex,
          type: curr.type,
          _id: curr._id,
          enemyId: curr.enemyId,
          enemyIds: curr.enemyIds,
          enemies: Array.isArray(curr.enemies) ? curr.enemies.slice(0, 3) : curr.enemies
        });
      }
      if (curr?.type === 'combat' && curr.enemyId) {
        // If we already have piles from BE, don't re-seed locally
        const pilesAlreadyLive =
          (gameState.enemyHand?.length || 0) +
          (gameState.enemyDeck?.length || 0) +
          (gameState.enemyDiscard?.length || 0) > 0;
        if (pilesAlreadyLive) return;
        const enemyData = await fetchEnemyById(curr.enemyId, token);
        if (enemyData) {
          const deckWithInstance = (enemyData.deck || enemyData.moveSet || []).map(createCardInstance);
          const shuffledDeck     = shuffleArray(deckWithInstance);
          const { newHand, newDeck, newDiscard } = drawHand(shuffledDeck, []);

          // Keep only what we truly know; don't synthesize hp on FE
          const enemyWithHp = {
            ...enemyData,
            stats: {
              ...(enemyData.stats || {}),
              vitality: enemyData?.stats?.vitality ?? enemyData?.vitality
            }
          };

          setGameState(gs => ({
            ...gs,
            enemy: enemyWithHp,
            enemyDeck: newDeck,
            enemyHand: newHand,
            enemyDiscard: newDiscard,
            activeEffects: { player: [], enemy: [] },
            onField: { player: [], enemy: [] },
            retargetPrompts: [],
            retargetChoices: [],
          }));
        }
      } else {
        setGameState(gs => ({
          ...gs,
          enemy: null,
          enemyDeck: [], enemyHand: [], enemyDiscard: [],
          activeEffects: { player: [], enemy: [] },
          onField: { player: [], enemy: [] },
          retargetPrompts: [],
          retargetChoices: [],
        }));
      }
    };
    if (campaign.length) updateRoomAndEnemy();
  }, [campaign, roomIndex, token, drawHand]);

  // Log when effects change (so we can see remaining turn counts tick)
  useEffect(() => {
    dlog('[FE][STATE] effects player:', (gameState.activeEffects?.player || []).map(e => `${e.type}${e.target?`(${e.target})`:''}[${e.remaining ?? '?'}]`));
    dlog('[FE][STATE] effects enemy :', (gameState.activeEffects?.enemy  || []).map(e => `${e.type}${e.target?`(${e.target})`:''}[${e.remaining ?? '?'}]`));
  }, [gameState.activeEffects]);
  useEffect(() => {
    if (gameState.enemy?._id) {
      dlog('[FE][ENEMY] loaded', gameState.enemy._id);
    }
  }, [gameState.enemy?._id]);
  // Log when on-field changes (spawn/resolve/tick)
  useEffect(() => {
    dlog('[FE][STATE] field player:', (gameState.onField?.player || []).map(f => `${f.card?.name || 'Card'}#${f.instanceId}(tRem=${f.turnsRemaining})`));
    dlog('[FE][STATE] field enemy :', (gameState.onField?.enemy  || []).map(f => `${f.card?.name || 'Card'}#${f.instanceId}(tRem=${f.turnsRemaining})`));
  }, [gameState.onField]);
  // Optional: log every request result message
  useEffect(() => {
    if (combatResult?.player?.message) dlog('[FE][MSG] player:', combatResult.player.message);
    if (combatResult?.enemy?.message)  dlog('[FE][MSG] enemy :',  combatResult.enemy.message);
  }, [combatResult]);

  // freeze gate (disable play/select)
  const isPlayerFrozen = Array.isArray(gameState.activeEffects?.player)
    && gameState.activeEffects.player.some(e => e.type === 'Freeze' && (e.remaining ?? 0) > 0);

  // derive death flags & gates
  const playerIsDead = typeof gameState.playerStats.hp === 'number' && gameState.playerStats.hp <= 0;
  const enemyHp     = gameState.enemy?.stats?.hp;
  const enemyIsDead = typeof enemyHp === 'number' && enemyHp <= 0;

  const selectionLocked = isPlayerFrozen || playerIsDead || enemyIsDead;
  const hasPendingPrompts = (Array.isArray(gameState.retargetPrompts)
    ? gameState.retargetPrompts : []).some(p => p.owner === 'player');
  const actionsDisabled = selectionLocked || !gameState.enemy?._id || turnInFlight || hasPendingPrompts;

  // For the current single-enemy flow; when multi-enemy lands, fill this from room enemyIds
  const enemiesArr = gameState.enemy ? [gameState.enemy] : [];
  const partyArr   = [{
    name: 'Main',
    imageUrl: '',
    stats: gameState.playerStats,
    delta: uiDelta.player,
  }];

  // Adapters for CharacterBadge ⓘ popups
  const enemyDetailsFor = (enemy) => {
    const deckCount = (typeof gameState.enemy?.deckCount === 'number')
      ? gameState.enemy.deckCount
      : (Array.isArray(gameState.enemyDeck) ? gameState.enemyDeck.length : 0);

    return makeEnemyDetails({
      enemy,
      hand: Array.isArray(gameState.enemyHand) ? gameState.enemyHand : [],
      deckCount
    });
  };

  const playerDetailsFor = () => makePlayerDetails({
    player: gameState.playerStats,
    delta: uiDelta.player
  });

  // memo helpers
  const spOf = useCallback((c) => (typeof c?.spCost === 'number' ? c.spCost : Number.POSITIVE_INFINITY), []);
  const selectedTotalSp = useMemo(() =>
    gameState.selectedCards.reduce((sum, iid) => {
      const c = gameState.hand.find(x => x.instanceId === iid);
      return sum + (c ? spOf(c) : 0);
    }, 0),
  [gameState.selectedCards, gameState.hand, spOf]);

  // Card selection (instanceId based)
  const handleCardSelect = useCallback((instanceId) => {
    if (selectionLocked) return;
    setGameState(gs => {
      const sel = gs.selectedCards.includes(instanceId)
        ? gs.selectedCards.filter(x => x !== instanceId)
        : [...gs.selectedCards, instanceId];

      // DEFAULT RULE: missing spCost = 0 (and explicit 0 stays 0)
      const totalSp = sel.reduce((sum, iid) => {
        const c = gs.hand.find(x => x.instanceId === iid);
        return sum + (c ? spOf(c) : 0);
      }, 0);

      if (sel.length > 2 || totalSp > gs.playerStats.sp) return gs;
      return { ...gs, selectedCards: sel };
    });
  }, [selectionLocked]);

  const canPlayTurn = gameState.selectedCards.length > 0
                   && selectedTotalSp <= gameState.playerStats.sp
                   && !playerIsDead
                   && !enemyIsDead
                   && !isPlayerFrozen;

  // (optional) debug crumb for gating
  useEffect(() => {
    if (actionsDisabled) {
      dlog('[FE][GATE] actions disabled', { playerIsDead, enemyIsDead, isPlayerFrozen, enemyLoaded: !!gameState.enemy?._id });
    }
  }, [actionsDisabled, playerIsDead, enemyIsDead, isPlayerFrozen, gameState.enemy]);

  // --- helpers: build the "selected cards" payload as actual cards ---
  const getSelectedCardMinimal = (selectedIids) => {
    if (!Array.isArray(selectedIids)) return [];
    const byId = new Map((gameState.hand || []).map(c => [String(c.instanceId), c]));
    return selectedIids
      .map(iid => byId.get(String(iid)))
      .filter(Boolean)
      .map(({ instanceId, _id, name, potency, defense, spCost, type, abilities, description }) => ({
        instanceId, _id, name, potency, defense, spCost, type, abilities, description
      }));
  };

  // --- Boot an encounter if we arrived from RunManager with room/campaign ---
  useEffect(() => {
    if (bootedRef.current) return;
    if (!token) { dlog('[BOOT] missing token'); return; }
    if (!bootRoom?._id || !bootCampaignId) {
      dlog('[BOOT] missing ids', { hasRoom: !!bootRoom, roomId: bootRoom?._id, bootCampaignId });
      return;
    }

    const bootEnemyId = normalizeRoom(bootRoom)?.enemyId;
    bootedRef.current = true;
    // 1) Seed the room into local state so the "load enemy for this room" effect can run.
    const one = normalizeRoom(bootRoom);
    dlog('[BOOT][SET] campaign room 0:', { type: one?.type, enemyId: one?.enemyId });
    setCampaign([one]);
    setRoomIndex(0);
    setRoomType(one?.type || 'combat');
    setLoading(true);
    void (async () => {
      try {
        // 2a) Eager enemy load (so enemyLoaded turns true ASAP)
        if (one?.enemyId && token) {
          try {
            const enemyDoc = await fetchEnemyById(one.enemyId, token);
            if (enemyDoc) setGameState(gs => ({ ...gs, enemy: enemyDoc }));
            dlog('[BOOT][ENEMY][FETCH]', one?.enemyId);
          } catch (e) {
            console.warn('[BOOT] enemy preload failed', e);
          }
        }

        dlog('[BOOT] starting encounter', {
          roomId: bootRoom._id,
          campaignId: bootCampaignId,
          enemyId: bootEnemyId,
        });
        const payload = {
          action: 'seed',
          campaignId: bootCampaignId,
          roomId: bootRoom._id,
          enemyId: bootEnemyId || undefined,

          // No intended plays on seed
          selectedCards: [],

          // Echo whatever we have locally (may be empty on first boot; that's OK)
          hand:        Array.isArray(gameState.hand)        ? gameState.hand        : [],
          deck:        Array.isArray(gameState.deck)        ? gameState.deck        : [],
          discardPile: Array.isArray(gameState.discardPile) ? gameState.discardPile : [],

          enemyHand:    Array.isArray(gameState.enemyHand)    ? gameState.enemyHand    : [],
          enemyDeck:    Array.isArray(gameState.enemyDeck)    ? gameState.enemyDeck    : [],
          enemyDiscard: Array.isArray(gameState.enemyDiscard) ? gameState.enemyDiscard : [],

          onField:       gameState.onField || { player: [], enemy: [] },
          activeEffects: gameState.activeEffects || { player: [], enemy: [] },

          // Only send enemy vitality (no hp), let BE derive hp
          playerStats: undefined,
          enemyStats:  (typeof gameState.enemy?.stats?.vitality === 'number'
            ? { vitality: gameState.enemy.stats.vitality }
            : undefined),

          seed: true
        };
        dlog('[FE][REQ][SEED]', payload);
        lastActionRef.current = 'seed';
        const res = await gameService.playTurn(payload, token);
        applyResult(res);
      } catch (err) {
        console.error('[BOOT][COMBAT] failed to start encounter', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, bootRoom?._id, bootCampaignId]);
  // ---- ability linking sanitizer (FE rule enforcer) ----
  const sanitizeCardForSend = (card) => {
    if (!card || typeof card !== 'object') return card;
    const abilities = Array.isArray(card.abilities) ? card.abilities : [];
    // find the primary Multi-Hit on the card (first with turns > 0)
    const mh = abilities.find(a => a?.type === 'Multi-Hit' && Number(a?.multiHit?.turns) > 0) || null;
    const mhKey = (mh?.key && String(mh.key).trim()) || (mh ? 'mh' : null);
    const norm = abilities.map(a => {
      if (!a || typeof a !== 'object') return a;
      // Ensure shape
      const next = { ...a };
      // Always force MH to link 'attack' only (no children link back to attack)
      if (next.type === 'Multi-Hit') {
        next.key = (next.key && String(next.key).trim()) || mhKey || 'mh';
        next.multiHit = {
          ...(next.multiHit || {}),
          link: 'attack'
        };
        // MH itself does not "link to" anything via linkedTo
        next.linkedTo = [];
        return next;
      }
      // For non-MH abilities: keep ONLY links that point to the MH's key
      const lt = Array.isArray(next.linkedTo) ? next.linkedTo : [];
      const onlyMH = mhKey ? Array.from(new Set(lt.filter(k => String(k) === mhKey))) : [];
      next.linkedTo = onlyMH;
      return next;
    });

    return { ...card, abilities: norm };
  };
  // Build the turn payload and ECHO STATE so BE doesn't re-seed.
  // Important: include piles + onField + stats every time.
  const baseTurnPayload = (action, selected) => {
    const sel = Array.isArray(selected) ? selected : [];

    return {
      action,
      campaignId: bootCampaignId || gameState.campaignId,
      roomId:     bootRoom?._id   || gameState.roomId,
      enemyId:    gameState.enemy?._id,

      // Intent
      selectedCards: sel.map(sanitizeCardForSend),

      // Echo CURRENT piles (player)
      hand:        Array.isArray(gameState.hand)        ? gameState.hand        : undefined,
      deck:        Array.isArray(gameState.deck)        ? gameState.deck        : undefined,
      discardPile: Array.isArray(gameState.discardPile) ? gameState.discardPile : undefined,

      // Echo CURRENT piles (enemy)
      enemyHand:    Array.isArray(gameState.enemyHand)    ? gameState.enemyHand    : undefined,
      enemyDeck:    Array.isArray(gameState.enemyDeck)    ? gameState.enemyDeck    : undefined,
      enemyDiscard: Array.isArray(gameState.enemyDiscard) ? gameState.enemyDiscard : undefined,

      // Echo persistent state so MH schedules tick correctly
      onField:       gameState.onField || undefined,
      activeEffects: gameState.activeEffects || undefined,

      // Stats (FE may send hpRemaining; our service bridges it to hp)
      playerStats: gameState.playerStats || undefined,
      // Echo enemy hp so BE doesn't reset to vitality*100 between turns
      enemyStats: (gameState.enemy?.stats
        ? {
            ...(typeof gameState.enemy.stats.hp === 'number'
              ? { hpRemaining: gameState.enemy.stats.hp }   // <<—— key piece
              : {}),
            ...(typeof gameState.enemy.stats.vitality === 'number'
              ? { vitality: gameState.enemy.stats.vitality }
              : {}),
            ...(typeof gameState.enemy.stats.sp === 'number' ? { sp: gameState.enemy.stats.sp } : {}),
            ...(typeof gameState.enemy.stats.maxSp === 'number' ? { maxSp: gameState.enemy.stats.maxSp } : {}),
          }
        : undefined),

      // Targeting/negation from UI
      retargetChoices: gameState.retargetChoices?.length ? gameState.retargetChoices : undefined,
      negationTarget:  gameState.negationTarget ?? undefined,

      // seed flag only when booting
      seed: action === 'seed' ? true : undefined,
    };
  };

  const eDeckCountLog = (typeof gameState.enemy?.deckCount === 'number')
    ? gameState.enemy.deckCount
    : (Array.isArray(gameState.enemyDeck) ? gameState.enemyDeck.length : 0);

  const eDiscardCountLog = (typeof gameState.enemy?.discardCount === 'number')
    ? gameState.enemy.discardCount
    : (Array.isArray(gameState.enemyDiscard) ? gameState.enemyDiscard.length : 0);

  dlog('[FE][PILES] eHand/eDeck/eDiscard:',
    (Array.isArray(gameState.enemyHand) ? gameState.enemyHand.length : 0),
    eDeckCountLog,
    eDiscardCountLog
  );

  const getPileCount = (v) =>
    typeof v === 'number' ? v :
    (Array.isArray(v) ? v.length : 0);
  // --- RESPONSE SHAPE NORMALIZER ---
  const pickResult = (res) => (res?.result ?? res?.data?.result ?? res?.data ?? res) || {};
  // --- APPLY RESULT helper (dedup) ---
  const applyResult = useCallback((res) => {
    setHandOpen(false);
    const R = pickResult(res);
    dlog('[FE][RESP] player/effects:',
      (R?.activeEffects?.player || []).map(e => `${e.type}${e.target?`(${e.target})`:''}[${e.remaining ?? '?'}]`)
    );
    dlog('[FE][RESP] enemy/effects :',
      (R?.activeEffects?.enemy || []).map(e => `${e.type}${e.target?`(${e.target})`:''}[${e.remaining ?? '?'}]`)
    );
    dlog('[FE][RESP] onField player :',
      (R?.onField?.player || []).map(f => `${f.card?.name || 'Card'}#${f.instanceId}(tRem=${f.turnsRemaining})`)
    );
    dlog('[FE][RESP] onField enemy  :',
      (R?.onField?.enemy || []).map(f => `${f.card?.name || 'Card'}#${f.instanceId}(tRem=${f.turnsRemaining})`)
    );
    // dlog('[FE][RESP] raw:', res);

    // snapshot enemy hand BEFORE we overwrite it, so we can diff later
    const prevEnemyHand = enemyHandPrevRef.current || [];

    // piles
    if (R.player && Array.isArray(R.player.hand)) {
      const pHand    = normalizePile(R.player.hand);
      const pDeck    = normalizePile(R.player.deck   || []);
      const pDiscard = normalizePile(R.player.discard|| []);
      setGameState(gs => ({
        ...gs,
        hand: pHand,
        selectedCards: [],
        deck: pDeck,
        discardPile: pDiscard,
      }));
    }
    if (R.enemy && Array.isArray(R.enemy.hand)) {
      setGameState(gs => {
        const resHand = Array.isArray(R.enemy.hand) ? R.enemy.hand : [];

        const deckRaw    = R.enemy.deck;
        const discardRaw = R.enemy.discard;

        const deckIsArr    = Array.isArray(deckRaw);
        const discardIsArr = Array.isArray(discardRaw);

        const resDeckArr    = deckIsArr    ? deckRaw    : [];
        const resDiscardArr = discardIsArr ? discardRaw : [];

        const hadLocalDeck    = Array.isArray(gs.enemyDeck)    && gs.enemyDeck.length > 0;
        const hadLocalDiscard = Array.isArray(gs.enemyDiscard) && gs.enemyDiscard.length > 0;
        const downgradeToEmpty = deckIsArr && resDeckArr.length === 0 && (hadLocalDeck || hadLocalDiscard);

        // keep a prev snapshot for “what the enemy just played” diffs (UI only)
        enemyHandPrevRef.current = resHand;

        return {
          ...gs,
          enemyHand: resHand,
          // Only overwrite arrays when the BE actually sent arrays; otherwise keep local arrays.
          enemyDeck:    deckIsArr    ? (downgradeToEmpty ? gs.enemyDeck    : resDeckArr)    : gs.enemyDeck,
          enemyDiscard: discardIsArr ? (downgradeToEmpty ? gs.enemyDiscard : resDiscardArr) : gs.enemyDiscard,
        };
      });
    }
    const eDeckCountNext    = getPileCount(R?.enemy?.deck);
    const eDiscardCountNext = getPileCount(R?.enemy?.discard);

    // stats + effects + field + prompts
    setGameState(gs => ({
      ...gs,
      playerStats: {
        ...gs.playerStats,
        hp: (R.player?.hp ?? R.player?.hpRemaining ?? gs.playerStats.hp),
        sp:    (R.player?.sp ?? gs.playerStats.sp),
        maxSp: (R.player?.maxSp ?? gs.playerStats.maxSp),
        attackPower:       (R.player?.attackPower       ?? gs.playerStats.attackPower),
        physicalPower:     (R.player?.physicalPower     ?? gs.playerStats.physicalPower),
        supernaturalPower: (R.player?.supernaturalPower ?? gs.playerStats.supernaturalPower),
        speed:             (R.player?.speed             ?? gs.playerStats.speed),
        defense:           (R.player?.defense           ?? gs.playerStats.defense),
      },
      enemy: {
        ...gs.enemy,
        stats: {
          ...gs.enemy?.stats,
          // keep hp in sync (prefer BE → previous → derive)
        hp:       (R.enemy?.hp ?? R.enemy?.hpRemaining ?? gs.enemy?.stats?.hp),
        vitality: (typeof R.enemy?.vitality === 'number'
                    ? R.enemy.vitality
                    : gs.enemy?.stats?.vitality),
          sp:    (R.enemy?.sp ?? gs.enemy?.stats?.sp),
          maxSp: (R.enemy?.maxSp ?? gs.enemy?.stats?.maxSp),
        },
        deckCount:    eDeckCountNext,
        discardCount: eDiscardCountNext,
      },
      // IMPORTANT: only overwrite when BE explicitly provides these
      activeEffects: (Object.prototype.hasOwnProperty.call(R, 'activeEffects') ? (R.activeEffects || { player: [], enemy: [] }) : gs.activeEffects),
      onField:       (Object.prototype.hasOwnProperty.call(R, 'onField')       ? (R.onField       || { player: [], enemy: [] }) : gs.onField),
      retargetPrompts: Array.isArray(R.retargetPrompts)
        ? R.retargetPrompts.filter(p => p.owner === 'player')
        : gs.retargetPrompts,
      retargetChoices: [],
    }));

    // NEW: compute (+buff) deltas for UI from effectiveStats vs base in result
    const eff = R?.effectiveStats;
    if (eff && R?.player && R?.enemy) {
      const pBase = R.player;
      const pEff  = eff.player || {};
      const eBase = R.enemy;
      const eEff  = eff.enemy || {};

      const pDelta = {
        attackPower:       (pEff.attackPower       ?? pBase.attackPower ?? 0) - (pBase.attackPower ?? 0),
        physicalPower:     (pEff.physicalPower     ?? pBase.physicalPower ?? 0) - (pBase.physicalPower ?? 0),
        supernaturalPower: (pEff.supernaturalPower ?? pBase.supernaturalPower ?? 0) - (pBase.supernaturalPower ?? 0),
      };
      const eDelta = {
        attackPower:       (eEff.attackPower       ?? eBase.attackPower ?? 0) - (eBase.attackPower ?? 0),
        physicalPower:     (eEff.physicalPower     ?? eBase.physicalPower ?? 0) - (eBase.physicalPower ?? 0),
        supernaturalPower: (eEff.supernaturalPower ?? eBase.supernaturalPower ?? 0) - (eBase.supernaturalPower ?? 0),
      };
      setUiDelta({ player: pDelta, enemy: eDelta });
    }

    // clear local draft too
    setRetargetSelections({});
        setCombatResult(R);

    // --- feed the drawer log with the same messages you show in the indicator ---
    setLogEntries(prev => {
      const next = [];
      if (Array.isArray(R?.log)) {
        next.push(...R.log.map(String));
      }
      if (R?.player?.message) next.push(`You: ${R.player.message}`);
      if (R?.enemy?.message)  next.push(`Enemy: ${R.enemy.message}`);
      if (R?.error)           next.push(`Error: ${R.error}`);
      return [...prev, ...next].slice(-100);
    });

    // ===== ENQUEUE ENEMY PLAYED CARDS (with guards to avoid false positives) =====
    // 1) Treat BE messages “skip/defend” as non-play
    const enemyMsgStr = (R?.enemy?.message || '').toLowerCase();
    const enemyDidNotPlay = enemyMsgStr.includes('skip') || enemyMsgStr.includes('defend');
    // [SNAPSHOT] enemy pre-state (before we update game state)
    const prevEnemySp = Number(gameState?.enemy?.stats?.sp ?? NaN);
    const prevEnemyFieldIds = Array.isArray(gameState?.onField?.enemy)
      ? gameState.onField.enemy.map(c => String(c.instanceId))
      : [];

    dlog('[FE][ENEMY][MSG/GATE]', { enemyMsgStr, enemyDidNotPlay });

    // 2) Snapshot “before” (from GS) and “after” (from BE) to detect true plays
    const nextEnemySp = Number(R?.enemy?.sp ?? NaN);

    const nextEnemyFieldIds = Array.isArray(R?.onField?.enemy)
      ? R.onField.enemy.map(f => String(f.instanceId))
      : [];

    const onFieldGrew = nextEnemyFieldIds.some(id => !prevEnemyFieldIds.includes(id));

    const nextEnemyHand = Array.isArray(R?.enemy?.hand) ? R.enemy.hand : null;
    const nextIds = new Set((nextEnemyHand || []).map(c => String(c.instanceId)));
    const removed = prevEnemyHand.filter(c => !nextIds.has(String(c.instanceId))); // cards that left enemy hand

    // 3) Decide if enemy actually played
    const spDropped =
      Number.isFinite(prevEnemySp) && Number.isFinite(nextEnemySp) && nextEnemySp < prevEnemySp;

    // Fallback for the “first observed” play when prev SP is unknown (NaN):
    // Consider it a play only if cards were removed AND next SP is exactly 0 (spent down).
    const spDropFallback =
      !Number.isFinite(prevEnemySp) && Number.isFinite(nextEnemySp) && nextEnemySp === 0 && removed.length > 0;

    dlog('[FE][ENEMY][PLAY-CHECK]', {
      prevEnemySp,
      nextEnemySp,
      spDropped,
      onFieldGrew,
      removedCount: removed.length,
      prevFieldCount: prevEnemyFieldIds.length,
      nextFieldCount: nextEnemyFieldIds.length
    });

    if (lastActionRef.current === 'seed') {
      // Seed response: instanceId domains may reset; do NOT show overlay.
      if (nextEnemyHand) {
        enemyHandPrevRef.current = nextEnemyHand;
      }
    } else if (!enemyDidNotPlay && (spDropped || spDropFallback || onFieldGrew)) {
      // “Looks like a play”: enqueue only the actually removed cards
      if (removed.length) {
        const minimal = removed.map(
          ({ instanceId, _id, name, potency, defense, spCost, type, abilities, description }) => ({
            instanceId,
            _id,
            name,
            potency,
            defense,
            spCost,
            type,
            abilities,
            description
          })
        );
        enqueuePlayed('enemy', minimal);
      }
    } else {
      // Not a play (skip/defend/seed or harmless reshuffle): just sync snapshot so next diff is correct
      if (nextEnemyHand) {
        enemyHandPrevRef.current = nextEnemyHand;
      }
    }

    // clear last action marker after handling this response
    lastActionRef.current = null;

    // --- NEW: frontend debug of the enemy's post-turn hand & piles (as echoed by BE)
    try {
      const eHand    = Array.isArray(R?.enemy?.hand)    ? R.enemy.hand    : [];
      const handNames = eHand.map(c => `${c.name || 'Card'}#${c.instanceId}`).join(', ');
      dlog('[FE][ENEMY][AFTER_TURN][FROM_BE] hand:', handNames || '(empty)');
      dlog('[FE][ENEMY][AFTER_TURN][FROM_BE] piles:', {
        deck: getPileCount(R?.enemy?.deck),
        discard: getPileCount(R?.enemy?.discard)
      });
    } catch {}
  }, [enqueuePlayed]);

  // --- PLAY / SKIP / DEFEND ---
  const handlePlayTurn = async () => {
    setHandOpen(false);
    // block if disabled or already sending
    if (actionsDisabled || turnInFlight) {
      dlog('[FE][GATE] play blocked', { actionsDisabled, turnInFlight });
      return;
    }

    // capture selection before we mutate state
    const selectedNow = getSelectedCardMinimal(gameState.selectedCards)
      .map(sanitizeCardForSend);

    setTurnInFlight(true);
    try {
      dlog('[FE][ACTION] play', { selected: gameState.selectedCards });
      if (!gameState.enemy?._id) {
        setCombatResult({ error: 'No enemy loaded!' });
        return;
      }
      // Pre-flight SP check to avoid 400 from server
      const spBudget = Number(gameState.playerStats?.sp ?? 0);
      const totalCost = (Array.isArray(selectedNow) ? selectedNow : []).reduce((n, c) => n + (typeof c?.spCost === 'number' ? c.spCost : Number.POSITIVE_INFINITY), 0);
      if (totalCost > spBudget) {
        setCombatResult({ error: `Not enough SP (${totalCost}/${spBudget})` });
        dlog('[FE][GATE] play blocked by SP budget', { totalCost, spBudget });
        setTurnInFlight(false);
        return;
      }

      const payload = baseTurnPayload('play', selectedNow);
      dlog('[FE][REQ][TURN] payload', payload);
      dlog('[FE][REQ][TURN] echo hpRemaining to BE:', {
        enemyHpSent: payload?.enemyStats?.hpRemaining,
        playerHpSent: payload?.playerStats?.hp
      });
      lastActionRef.current = 'play';
      const res = await gameService.playTurn(payload, token);
      applyResult(res);

      // show what was just played (use the snapshot we captured)
      enqueuePlayed('player', selectedNow);

      dlog('[FE][ACTION] done');
    } catch (err) {
      console.error(err);
      setCombatResult({ error: err?.message || 'Combat error!' });
    } finally {
      setTurnInFlight(false);
    }
  };

  const handleSkipTurn = async () => {
    setHandOpen(false);
    if (actionsDisabled || turnInFlight) {
      dlog('[FE][GATE] skip blocked', { actionsDisabled, turnInFlight });
      return;
    }

    setTurnInFlight(true);
    try {
      dlog('[FE][ACTION] skip');
      if (!gameState.enemy?._id) {
        setCombatResult({ error: 'No enemy loaded!' });
        return;
      }

      const payload = baseTurnPayload('skip', []);
      dlog('[FE][REQ][TURN] payload', payload);
      dlog('[FE][REQ][TURN] echo hpRemaining to BE:', {
        enemyHpSent: payload?.enemyStats?.hpRemaining,
        playerHpSent: payload?.playerStats?.hp
      });
      lastActionRef.current = 'skip';
      const res = await gameService.playTurn(payload, token);
      applyResult(res);

      // (skip plays nothing but keep the overlay API consistent)
      enqueuePlayed('player', getSelectedCardMinimal(gameState.selectedCards));

      dlog('[FE][ACTION] done');
    } catch (err) {
      console.error(err);
      setCombatResult({ error: err?.message || 'Skip error!' });
    } finally {
      setTurnInFlight(false);
    }
  };

  const handleDefend = async () => {
    setHandOpen(false);
    if (actionsDisabled || turnInFlight) {
      dlog('[FE][GATE] defend blocked', { actionsDisabled, turnInFlight });
      return;
    }

    setTurnInFlight(true);
    try {
      dlog('[FE][ACTION] defend');
      if (!gameState.enemy?._id) {
        setCombatResult({ error: 'No enemy loaded!' });
        return;
      }

      const payload = baseTurnPayload('defend', []);
      dlog('[FE][REQ][TURN] payload', payload);
      dlog('[FE][REQ][TURN] echo hpRemaining to BE:', {
        enemyHpSent: payload?.enemyStats?.hpRemaining,
        playerHpSent: payload?.playerStats?.hp
      });
      lastActionRef.current = 'defend';
      const res = await gameService.playTurn(payload, token);
      applyResult(res);

      // keep overlay API consistent
      enqueuePlayed('player', getSelectedCardMinimal(gameState.selectedCards));

      dlog('[FE][ACTION] done');
    } catch (err) {
      console.error(err);
      setCombatResult({ error: err?.message || 'Defend error!' });
    } finally {
      setTurnInFlight(false);
    }
  };

  const handleNextRoom = async () => {
    const isLast = roomIndex + 1 >= campaign.length;
    // If we booted into a single room (from RunManager), leaving the last room should exit
    if (isLast && (bootRoom?._id || bootCampaignId)) {
      setCombatResult(null);
      setLogEntries([]);

      // 1) Compute the next index (prefer the second fallback)
      let nextIndex = roomIndex + 1;
      try {
        const pciRaw = sessionStorage.getItem('postCombatIndex');
        if (pciRaw != null && !Number.isNaN(Number(pciRaw))) {
          nextIndex = Math.max(0, Math.floor(Number(pciRaw)));
        } else {
          const raw = sessionStorage.getItem('preCombatCheckpoint');
          const cp = raw ? JSON.parse(raw) : null;
          if (cp && typeof cp.roomIndex === 'number') {
            nextIndex = cp.roomIndex + 1;
          }
        }
      } catch {}

      // 2) Persist advance + clear server checkpoint (non-empty body avoids 400)
      try {
        await gameService.saveState({
          progress: { roomIndex: nextIndex },
          roomIndex: nextIndex,
          checkpoint: null,
          // optional hygiene: clear the server-side postCombatIndex too
          postCombatIndex: null
        }, token);
      } catch {}

      // 3) Clear local backup and return to RunManager
      try { sessionStorage.removeItem('preCombatCheckpoint'); } catch {}
      try { sessionStorage.removeItem('postCombatIndex'); } catch {}
      navigate(-1);
      return;
    }
    setRoomIndex(i => i + 1);
    setCombatResult(null);
    setLogEntries([]);
  };

  // --- Retarget helpers ---
  const labelTargetOption = useCallback((opt) => {
    if (!opt || !opt.kind) return 'Unknown';
    if (opt.kind === 'character') return 'Enemy (character)';
    // field target: find the card for nicer label
    const list = opt.side === 'enemy' ? (gameState.onField?.enemy || []) : (gameState.onField?.player || []);
    const ref = list.find(x => String(x.instanceId) === String(opt.instanceId));
    if (ref) {
      const owner = opt.side === 'enemy' ? 'Enemy' : 'You';
      const turns = Math.max(0, ref.turnsRemaining);
      return `${owner} field: ${ref.card?.name || 'Card'} (${turns}T)`;
    }
    const owner = opt.side === 'enemy' ? 'Enemy' : 'You';
    return `${owner} field #${opt.instanceId}`;
  }, [gameState.onField]);

  const onPickRetarget = (pid, targetRef) => {
    setRetargetSelections(sel => ({ ...sel, [pid]: targetRef }));
  };
  const onInitDefaultRetarget = (pid, targetRef) => {
    setRetargetSelections(sel => (sel[pid] ? sel : { ...sel, [pid]: targetRef }));
  };
  const onConfirmRetargets = () => {
    const prompts = gameState.retargetPrompts || [];
    const choices = prompts
      .filter(p => p.owner === 'player')
      .map(p => ({
        owner: 'player',
        instanceId: p.instanceId,
        targetRef: retargetSelections[String(p.instanceId)] || (Array.isArray(p.options) ? p.options[0] : { kind: 'character' })
      }));
    if (!choices.length) return;
    setGameState(gs => ({
      ...gs,
      retargetChoices: [...(gs.retargetChoices || []), ...choices],
      retargetPrompts: [],
    }));
    setRetargetSelections({});
  };
  const onCancelRetargets = () => {
    setRetargetSelections({});
    setGameState(gs => ({ ...gs, retargetPrompts: [] }));
  };
  useEffect(() => {
    if (!token) return;
    if (enemyIsDead || playerIsDead) {
      try { sessionStorage.removeItem('preCombatCheckpoint'); } catch {}
      void gameService.patchState({ checkpoint: null }, token).catch(() => {});
      void gameService.clearCheckpoint(token).catch(() => {});
    }
  }, [enemyIsDead, playerIsDead, token]);
  // ------- PAGE-SCALE WRAPPED RETURNS -------
  if (loading) {
    return (
      <div className="page-bg">
        <div className="page-scale">
          <div className="game-page">Loading...</div>
        </div>
      </div>
    );
  }

  if (roomIndex >= campaign.length) {
    // If we were launched into a single room (RunManager → GamePage), exiting the last room should not show "congrats"
    if (bootRoom?._id || bootCampaignId) {
      return (
        <div className="page-bg">
          <div className="page-scale">
            <div className="game-page">
              <div className="combat-result">
                <span>Room cleared.</span>
              </div>
              <button className="next-room-btn" onClick={() => navigate(-1)}>
                Leave Room
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Fallback for real multi-room campaigns (e.g., default debug flow)
    return (
      <div className="page-bg">
        <div className="page-scale">
          <div className="game-page">Congratulations! You finished the campaign.</div>
        </div>
      </div>
    );
  }

  const currentRoom = campaign[roomIndex] || null;
  if (roomType === 'loot') {
    return (
      <div className="page-bg">
        <div className="page-scale">
          <LootRoom
            room={currentRoom}
            roomId={currentRoom?._id}
            onNext={handleNextRoom}
          />
        </div>
      </div>
    );
  }
  if (roomType === 'merchant') {
    return (
      <div className="page-bg">
        <div className="page-scale">
          <MerchantRoom
            room={currentRoom}
            roomId={currentRoom?._id}
            onNext={handleNextRoom}
          />
        </div>
      </div>
    );
  }
  if (roomType === 'event') {
    return (
      <div className="page-bg">
        <div className="page-scale">
          <EventRoom
            room={currentRoom}
            roomId={currentRoom?._id}
            onNext={handleNextRoom}
          />
        </div>
      </div>
    );
  }

  const toFx = (e) =>
    typeof e === 'string'
      ? { type: e }
      : (e || {});

  const effectsEnemy  = gameState.activeEffects?.enemy  || [];
  const effectsPlayer = gameState.activeEffects?.player || [];

  const fieldEnemy  = Array.isArray(gameState?.onField?.enemy)  ? gameState.onField.enemy  : [];
  const fieldPlayer = Array.isArray(gameState?.onField?.player) ? gameState.onField.player : [];
  const HAND_W = 176;           // keep in sync with --ct-hand-w
  const HAND_GAP = 16;
  const getHandOverlayWidthStyle = (count) => {
    const cols = Math.min(Math.max(count, 1), 4);
    const widthPx = cols * HAND_W + (cols - 1) * HAND_GAP;
    return {
      width: `${widthPx}px`,
      maxWidth: 'min(1200px, 96vw)',   // never exceed viewport
    };
  };
  let displayRoomNumber = roomIndex + 1;
  try {
    const raw = sessionStorage.getItem('preCombatCheckpoint');
    const cp = raw ? JSON.parse(raw) : null;
    if (cp && typeof cp.roomIndex === 'number') {
      displayRoomNumber = cp.roomIndex + 1;
    }
  } catch {}
  return (
    <div className="page-bg">
      <div className="page-scale no-scale">
        <div className="game-page fullscreen">
          <h2>
            Room {displayRoomNumber}: {roomType.charAt(0).toUpperCase() + roomType.slice(1)}
          </h2>

          <div className="combat-layout" style={{ position: 'relative' }}>
            {/* Left, skinny drawer for logs (scrollable, fixed-height) */}
            <CombatLogDrawer logs={logEntries} />

            {/* Right rail: hand toggle + deck thumbnail (fixed size) */}
            <div
              className="right-rail"
              style={{
                position: 'absolute',
                right: '-8px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'grid',
                gap: 12,
                zIndex: 3,
              }}
            >
              <button
                type="button"
                className="hand-thumb"
                title={handOpen ? 'Hide hand' : 'Show hand'}
                aria-pressed={handOpen}
                onClick={() => setHandOpen(o => !o)}
                style={{
                  width: 76,
                  height: 104,
                  borderRadius: 10,
                  border: '1px solid #2e3a58',
                  background: '#0f1524',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                Hand
              </button>
            </div>

            {/* ===== TOP: enemies with inline “Effect” tab ===== */}
            <div className="top-row has-inline-effects">
              <div className="enemy-with-effects">
                <MultiEnemyRow
                  enemies={enemiesArr}
                  renderDetails={(enemy) => enemyDetailsFor(enemy)}
                />
            
                {/* Right-side vertical tab next to enemy badges */}
                <div className="fx-inline">
                  <button
                    className="fx-tab enemy"
                    aria-label="Show enemy effects"
                    onClick={() => setFxOpen(fxOpen === 'enemy' ? null : 'enemy')}
                  >
                   Effect
                  </button>
            
                  {fxOpen === 'enemy' && (
                    <div className="fx-flyout enemy" role="dialog" aria-label="Enemy effects">
                      <div className="panel small">
                        <EffectsList title="Enemy Effects" effects={effectsEnemy} />
                      </div>
                      <OnFieldList title="Enemy On-Field" items={fieldEnemy} />
                    </div>
                  )}
                </div>
              </div>
             </div>

            {/* ===== MIDDLE BOARD ===== */}
            <div className="board" style={{ position: 'relative' }}>
              {/* Hand overlay (inside the board, above the player row) */}
              {handOpen && (
                <div
                  className="hand-overlay"
                  role="dialog"
                  aria-label="Your hand"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bottom: 'calc(var(--slot-h) + 20px)',
                    display: 'flex',
                    flexWrap: 'nowrap',            // keep one row
                    gap: 16,
                    justifyContent: 'center',
                    overflow: 'visible',
                    zIndex: 10,
                    background: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    pointerEvents: 'auto',
                    ...getHandOverlayWidthStyle((gameState.hand || []).length), // size to card count
                  }}
                >
                  <div className="card-hand">
                    {gameState.hand.map((card, idx) => {
                      const isSelected = gameState.selectedCards.includes(card.instanceId);

                      const currentTotalSp = gameState.selectedCards.reduce((sum, iid) => {
                        const c = gameState.hand.find(x => x.instanceId === iid);
                        return sum + (c ? spOf(c) : 0);
                      }, 0);

                      const wouldExceedIfSelected =
                        (currentTotalSp + (isSelected ? 0 : spOf(card))) > gameState.playerStats.sp;

                      const disabled = (!isSelected && (wouldExceedIfSelected || selectionLocked));

                      const key = card.instanceId ?? `${card._id || 'noid'}-${idx}`;
                      return (
                        <div
                          key={key}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                        >
                          <CardTile
                            card={card}
                            selected={isSelected}
                            disabled={disabled}
                            onSelect={() => handleCardSelect(card.instanceId)}
                            onDesc={() => setDescCard(card)}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <CardDescDialog
                    open={!!descCard}
                    card={descCard}
                    onClose={() => setDescCard(null)}
                  />
                </div>
              )}

              {/* D) Played overlay */}
              {showPlayed && (
                <div
                  className="played-overlay"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bottom: `${handBottom}px`,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    justifyContent: 'center',
                    pointerEvents: 'auto',    // allow clicking Confirm
                    overflow: 'hidden',
                    zIndex: 11,
                    ...getHandOverlayWidthStyle(playedOverlay.length),
                  }}
                >
                  {playedOverlay.map((c, i) => (
                    <div key={c?.instanceId ?? `po-${i}`}> 
                      <CardTile card={c} variant="mini" />
                    </div>
                  ))}
                  <div style={{ flexBasis: '100%', textAlign: 'center', marginTop: 8 }}>
                    <div style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 6 }}>
                      {playedOwner === 'enemy' ? 'Enemy played' : 'You played'}
                    </div>
                    <button
                      onClick={confirmPlayedOverlay}
                      style={{
                        background: '#4e6cb8', color: '#fff', border: 'none',
                        borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
                        boxShadow: '0 6px 16px rgba(0,0,0,.35)'
                      }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {/* Unified Field: enemy row (top) + player row (bottom) */}
              <FieldTable
                enemyItems={gameState.onField?.enemy || []}
                playerItems={gameState.onField?.player || []}
              />
            </div>

            {/* ===== BOTTOM: player effects + party row ===== */}
            <div className="bottom-row has-inline-effects">
              <div className="player-with-effects">
                {/* Left-side vertical tab next to player badge */}
                <div className="fx-inline">
                  <button
                    className="fx-tab player"
                    aria-label="Show your effects"
                    onClick={() => setFxOpen(fxOpen === 'player' ? null : 'player')}
                  >
                    Effect
                  </button>

                  {fxOpen === 'player' && (
                    <div className="fx-flyout player" role="dialog" aria-label="Your effects">
                      <div className="panel small">
                        <EffectsList title="Your Effects" effects={effectsPlayer} />
                      </div>
                      <OnFieldList title="Your On-Field" items={fieldPlayer} />
                    </div>
                  )}
                </div>

                <PartyRow party={partyArr} renderDetails={() => playerDetailsFor()} />
              </div>
            </div>
          </div>

          {/* ===== Target prompts ===== */}
          <RetargetPrompts
            prompts={(gameState.retargetPrompts || []).filter(p => p.owner === 'player')}
            selections={retargetSelections}
            onPick={onPickRetarget}
            onInitDefault={onInitDefaultRetarget}
            onConfirm={onConfirmRetargets}
            onCancel={onCancelRetargets}
            onLabel={labelTargetOption}
          />

          {/* ===== Actions (disabled when dead/frozen/no enemy) ===== */}
          <div
            style={{
              opacity: actionsDisabled ? 0.5 : 1,
              pointerEvents: actionsDisabled ? 'none' : 'auto',
            }}
          >
            <ActionButtons
              canPlay={canPlayTurn}
              onPlay={handlePlayTurn}
              onSkip={handleSkipTurn}
              onDefend={handleDefend}
            />
          </div>

          {/* ===== Win/Lose banners ===== */}
          {enemyIsDead && (
            <div className="combat-result" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>Room cleared.</span>
              <button className="next-room-btn" onClick={handleNextRoom}>
                Leave Room
              </button>
            </div>
          )}
          {playerIsDead && (
            <div className="combat-result error">
              <span>You were defeated.</span>
            </div>
          )}
          {combatResult?.player?.message && (
            <div className="combat-result">
              <span>{combatResult.player.message}</span>
            </div>
          )}
          {combatResult?.error && (
            <div className="combat-result error">
              <span>{combatResult.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePage;
