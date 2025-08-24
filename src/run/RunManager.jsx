// src/RunManager.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import campaignService from '../services/campaignService';
import gameService from '../services/gameService';
import LootRoom from '../rooms/LootRoom';
import MerchantRoom from '../rooms/MerchantRoom';
import EventRoom from '../rooms/EventRoom';
import '../styles/GamePage.css';
import MoneyIndicator from '../components/MoneyIndicator';
import { getRoom, recruitEvent } from '../api/roomApi';

const rlog = (...a) => { try { console.log('[RUN]', ...a); } catch {} };
// -------- utilities that mirror your SavedGame shape --------
const uniqIds = (arr = []) => [...new Set(arr.map(String))];
function upsertDeck(decks = [], characterId, cardId, maxDeck = 30) {
  const idx = decks.findIndex(d => String(d.character) === String(characterId));
  if (idx === -1) {
    return [...decks, { character: characterId, cards: cardId ? [cardId] : [] }];
  }
  const copy = decks.map(d => ({ ...d, cards: [...(d.cards || [])] }));
  const deck = copy[idx];
  if (cardId && (!deck.cards || deck.cards.length < maxDeck)) {
    deck.cards.push(cardId);
  }
  return copy;
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Minimal boss overlay
function BossOverlay({ onEnter }) {
  return (
    <div className="modal-overlay">
      <div className="modal card">
        <h2>⚠️ BOSS APPROACHES ⚠️</h2>
        <p>Prepare yourself.</p>
        <div className="modal-actions">
          <button className="primary" onClick={onEnter}>Begin Boss Battle</button>
        </div>
      </div>
    </div>
  );
}


function RestArea({ onNext }) {
  return (
    <div className="room rest-room">
      <h2>Rest Area</h2>
      <p>You take a brief rest.</p>
      <div className="room-actions">
        <button className="primary" onClick={onNext}>Continue</button>
      </div>
    </div>
  );
}


export default function RunManager({
  campaignId,
  mode = 'generate',
  length,
  onEnterCombat,
  onExitRun,
}) {
  const { token } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [game, setGame] = useState(null);
  const [path, setPath] = useState([]);
  const [idx, setIdx] = useState(0);
  const [showBossGate, setShowBossGate] = useState(false);
  const [roomCache, setRoomCache] = useState({});
  const navigate = useNavigate();
  const unwrapPath = (res) => {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.sequence)) return res.sequence;
    if (res && Array.isArray(res.rooms)) return res.rooms;
    if (res && Array.isArray(res.campaign)) return res.campaign;
    return [];
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);

      const saved = await gameService.loadState(token).catch(() => null);
      rlog('SavedGame loaded on boot:', saved);

      const progress = saved?.progress;
      const hasSavedPath =
        (Array.isArray(progress?.generatedPath) && progress.generatedPath.length) ||
        (Array.isArray(saved?.campaign) && saved.campaign.length);

      let runPath = [];
      let startIndex = 0;

      if (hasSavedPath && String(progress?.campaignId || '') === String(campaignId || '')) {
        runPath = progress?.generatedPath?.length ? progress.generatedPath : saved.campaign;
        // Prefer the top-level roomIndex; fall back to the nested progress value
        startIndex = clamp(
          (typeof saved?.roomIndex === 'number' ? saved.roomIndex :
          (typeof progress?.roomIndex === 'number' ? progress.roomIndex : 0)),
          0, Math.max(0, runPath.length - 1)
        );
        rlog('Resuming existing path', { startIndex, len: runPath.length });
      } else {
        if (mode === 'sequence') {
          const seq = await campaignService.getCampaignSequence(campaignId, token).catch(() => []);
          runPath = unwrapPath(seq);
          rlog('Loaded sequence path', { len: runPath.length });
        } else {
          const gen = await campaignService.generateCampaign(
            campaignId, (typeof length === 'number' ? { length } : {}), token
          ).catch(() => []);
          runPath = unwrapPath(gen);
          rlog('Generated path', { len: runPath.length });
        }
        startIndex = 0;
      }
      // One-shot post-combat resume: prefer postCombatIndex if present
      const pci = Number(
        saved?.postCombatIndex ?? saved?.progress?.postCombatIndex
      );
      if (Number.isFinite(pci)) {
        const clamped = Math.max(0, Math.min(pci, Math.max(0, runPath.length - 1)));
        if (clamped !== startIndex) {
          startIndex = clamped;
        }
        // Clear it immediately so it’s truly one-shot, and nuke any server checkpoint
        try {
          await gameService.saveState({ progress: { postCombatIndex: undefined }, checkpoint: null }, token);
        } catch {}
      }

      if (!mounted) return;

      const seedGame = {
        ...(saved || {}),
        money: saved?.money ?? 0,
        decks: Array.isArray(saved?.decks) ? saved.decks : [],
        minDeck: saved?.minDeck ?? 30,
        maxDeck: saved?.maxDeck ?? 30,
        progress: {
          ...(saved?.progress || {}),
          campaignId,
          roomIndex: startIndex,
          generatedPath: runPath
        },
        roomIndex: startIndex,
        campaign: runPath
      };
      // --- make the app actually render the run ---
      if (mounted) {
        setGame(seedGame);
        setPath(runPath);
        setIdx(startIndex);
        setLoading(false);
      }
      gameService.saveState(seedGame, token)
        .then(() => rlog('SavedGame persisted after boot'))
        .catch((e) => rlog('saveState after boot failed:', e?.message || e));
    })();

    return () => { mounted = false; };
  }, [campaignId, mode, length, token]);

  const currentRaw = useMemo(() => path[idx], [path, idx]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof currentRaw === 'string' && !roomCache[currentRaw]) {
        rlog('Inflating room by id', currentRaw);
        const doc = await getRoom(currentRaw, token).catch((e) => {
          rlog('getRoom failed', e?.message || e);
          return null;
        });
        if (mounted && doc) {
          setRoomCache(prev => ({ ...prev, [currentRaw]: doc }));
        }
      }
    })();
    return () => { mounted = false; };
  }, [currentRaw, roomCache, token]);

  const current = useMemo(() => {
    if (typeof currentRaw === 'string') return roomCache[currentRaw] || null;
    return currentRaw || null;
  }, [currentRaw, roomCache]);

  const isLast = useMemo(() => idx >= path.length - 1, [path, idx]);

  const persist = async (patch) => {
    const base = { ...(game || {}) };
    // Evaluate any functional patch values into plain data
    const resolved = Object.fromEntries(
      Object.entries(patch || {}).map(([k, v]) => [k, (typeof v === 'function' ? v(base) : v)])
    );
    const next = { ...base, ...resolved };
    setGame(next);
    try {
      await gameService.saveState(next, token);
      rlog('SavedGame persisted (patch)', resolved);
      return true;
    } catch (e) {
      rlog('saveState failed (patch):', e?.message || e);
      return false;
    }
  };

  const applyOneReward = async (reward) => {
    if (!reward || !game) return;

    // 1) Money → SavedGame.money (use server baseline)
    if (reward.kind === 'money') {
      const inc = Number(reward.amount) || 0;
      const saved = await gameService.loadState(token).catch(() => null);
      const base = Number(saved?.money) || 0;
      const nextMoney = base + inc;

      // Update UI immediately
      setGame(g => ({ ...g, money: nextMoney }));
      // Persist only the money field
      await gameService.patchState({ money: nextMoney }, token);
      return;
    }

    // 2) Stat buff → SavedGame.extraStats (use server baseline)
    if (reward.kind === 'statBuff' && reward.stat) {
      const stat = String(reward.stat);
      const delta = Number(reward.amount ?? reward.value) || 0;

      const saved = await gameService.loadState(token).catch(() => null);
      const cur = (saved?.extraStats && typeof saved.extraStats === 'object') ? saved.extraStats : {};
      const next = { ...cur, [stat]: (Number(cur[stat]) || 0) + delta };

      // Update UI immediately
      setGame(g => ({ ...g, extraStats: next }));
      // Persist only the extraStats object
      await gameService.patchState({ extraStats: next }, token);
      return;
    }

    // 3) Card → SavedGame.extraDeck (merge by cardId, increment qty)
    if (reward.kind === 'card' && reward.cardId && !reward.skipped) {
      // read server copy so we merge with latest extraDeck
      const saved = await gameService.loadState(token).catch(() => null);
      const cur = Array.isArray(saved?.extraDeck) ? saved.extraDeck.slice() : [];
      const id = String(reward.cardId);
      const i = cur.findIndex(e => String(e?.cardId || e?._id || e?.id) === id);
      if (i >= 0) {
        const prev = cur[i];
        const prevQty = Number(prev.qty) || 0;
        cur[i] = {
          ...prev,
          cardId: prev.cardId || prev._id || prev.id || id,
          qty: Math.max(1, prevQty + 1),
        };
      } else {
        cur.push({ cardId: id, qty: 1 });
      }
      // Update UI immediately
      setGame(g => ({ ...g, extraDeck: cur }));
      // Persist only the extraDeck array
      await gameService.patchState({ extraDeck: cur }, token);
      return;
    }
  };

  // Accepts a single reward or an array of rewards and applies them in order
  const applyRewards = async (rewardOrList) => {
    const list = Array.isArray(rewardOrList) ? rewardOrList : [rewardOrList];
    for (const r of list) {
      try {
        await applyOneReward(r);
      } catch (e) {
        rlog('applyOneReward failed:', e?.message || e);
      }
    }
  };

  const goNext = async () => {
    if (isLast) {
      rlog('Run finished — clearing SavedGame');
      try {
        await campaignService.clearSavedGame();
      } catch {}
      // Don’t show Continue next time
      try { sessionStorage.removeItem('allowRunOnce'); } catch {}
      onExitRun?.(); // your app may navigate to a victory screen here
      return;
    }
    const nextIndex = idx + 1;
    setTransitioning(true);
    rlog('Advancing to room index (pending persist)', nextIndex);
 
    // (Optional) prefetch the next room doc so render is instant afterwards
    const nextRaw = path[nextIndex];
    if (typeof nextRaw === 'string' && !roomCache[nextRaw]) {
      try {
        rlog('Prefetching next room doc', nextRaw);
        const doc = await getRoom(nextRaw, token).catch(() => null);
        if (doc) setRoomCache(prev => ({ ...prev, [nextRaw]: doc }));
      } catch {}
    }
 
    const ok = await persist({
      progress: { ...(game?.progress || {}), roomIndex: nextIndex },
      roomIndex: nextIndex
    });
    if (!ok) {
      rlog('Persist failed; staying on current room');
      setTransitioning(false);
      return;
    }
    // Only now move the UI to the next room
    setIdx(nextIndex);
    setTransitioning(false);
  };

  // After returning from GamePage (Leave Room), optionally auto-advance this run.
  useEffect(() => {
    const flag = (() => {
      try { return sessionStorage.getItem('postCombatAdvance'); } catch { return null; }
    })();
    if (flag === '1' && path.length) {
      try { sessionStorage.removeItem('postCombatAdvance'); } catch {}
      // delete the local backup (pre-combat checkpoint)
      try { sessionStorage.removeItem('preCombatCheckpoint'); } catch {}
      // best-effort: clear any server-side checkpoint too
      void persist({ checkpoint: null });
      rlog('Post-combat advance: cleared checkpoint and advancing');
      void goNext();
    }
  }, [path.length]);

  if (loading) return <div className="room"><h3>Loading run…</h3></div>;
  if (!current) return <div className="room"><h3>Loading room…</h3></div>;
  // Small overlay during between-room saves/fetches
  const TransitionOverlay = transitioning ? (
    <div className="modal-overlay">
      <div className="modal card"><h3>Loading next room…</h3></div>
    </div>
  ) : null;
  const type = current.type;
  if (loading || !game) {
    return <div className="room"><h2>Loading…</h2></div>;
  }
  if (type === 'rest') {
    rlog('Rendering RestArea (cosmetic)');
    return (
      <>
        {TransitionOverlay}
        <RestArea onNext={goNext} />
      </>
    );
  }

  if (type === 'boss' && showBossGate) {
    return <BossOverlay onEnter={() => {
      setShowBossGate(false);
      if (onEnterCombat) onEnterCombat({ ...current, campaignId });
      else goNext();
      void enterCombatNow(current);
    }} />;
  }
  // Save a pre-combat checkpoint (local + server) and hop into GamePage
  async function enterCombatNow(roomDoc) {
    const checkpoint = {
      kind: 'preCombat',
      campaignId,
      roomId: roomDoc?._id || roomDoc?.id || roomDoc,
      roomIndex: idx,
      money: game?.money ?? 0,
      ts: Date.now(),
    };
    const postCombatIndex = idx + 1;
    try {
      sessionStorage.setItem('preCombatCheckpoint', JSON.stringify(checkpoint));
      sessionStorage.setItem('postCombatIndex', String(postCombatIndex));
      await persist({ checkpoint, postCombatIndex }); // second fallback lives outside progress
    } catch {}

    // Allow one guarded hop without ContinueGuard re-route
    sessionStorage.setItem('allowRunOnce', '1');

    if (onEnterCombat) {
      // keep the payload shape your AppRouter expects
      onEnterCombat({ current: roomDoc, campaignId });
    } else {
      navigate('/game', { state: { room: roomDoc, campaignId } });
    }
  };

  if (type === 'combat' || type === 'boss') {
    const enter = () => {
      if (type === 'boss') setShowBossGate(true);
      else void enterCombatNow(current);
    };

    return (
      <div className="room combat-gate">
        <h2>{type === 'boss' ? 'Boss Fight' : 'Combat'}</h2>
        <div className="room-actions">
          <button className="primary" onClick={enter}>
            {type === 'boss' ? 'Approach the Boss' : 'Enter Combat'}
          </button>
        </div>
      </div>
    );
  }

  if (type === 'loot') {
    return (
      <>
        {TransitionOverlay}
        <MoneyIndicator amount={game?.money ?? 0} />
        <LootRoom
          room={current}
          onNext={goNext}
          onApplyReward={applyRewards}
        />
      </>
    );
  }

  if (type === 'merchant') {
    rlog('Rendering MerchantRoom');
    return (
      <>
        {TransitionOverlay}
        <MoneyIndicator amount={game?.money ?? 0} />
        <MerchantRoom
          room={current}
          onNext={goNext}
          onApplyReward={applyRewards}
        />
      </>
    );
  }

  if (type === 'event') {
    rlog('Rendering EventRoom');
    return (
      <>
        {TransitionOverlay}
        <MoneyIndicator amount={game?.money ?? 0} />
        <EventRoom
          room={current}
          onNext={goNext}
          onApplyEvent={applyRewards}
        />
      </>
    );
  }

  return (
    <div className="room">
      <h2>{type}</h2>
      <div className="room-actions">
        {TransitionOverlay}
        <button className="primary" onClick={goNext} disabled={transitioning}>Continue</button>
      </div>
    </div>
  );
}
