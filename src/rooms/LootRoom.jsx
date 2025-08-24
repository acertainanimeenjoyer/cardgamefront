// src/rooms/LootRoom.jsx
import React, { useEffect, useState, useContext, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { getLoot } from '../api/roomApi';
import gameService from '../services/gameService';
import api from '../services/apiService';
import CardTile from '../components/cards/CardTile';
import '../components/cards/CardTile.css';
import '../styles/GamePage.css';

const dlog = (...a) => { try { console.log('[LOOT]', ...a); } catch {} };
// Guard to prevent double-apply of non-card loot when effects mount twice in dev (StrictMode)
const appliedNonCardGlobal = new Set(); // keys: `${userId}:${roomId}`

const bgUrl = (room) => room?.backgrounds?.[0]?.data || '';

const getCardId = (it) => it?.cardId || it?._id || it?.card || it?.id || null;
// Append one or more cards to SavedGame.extraDeck (run-scoped)
// Append one or more cards to SavedGame.extraDeck (run-scoped)
async function appendExtraDeck(cardId, qty = 1, token) {
  if (!cardId) return;
  const saved = await gameService.loadState(token).catch(() => null);
  const cur = Array.isArray(saved?.extraDeck) ? saved.extraDeck.slice() : [];
  const id = String(cardId);
  const i = cur.findIndex(e => String(e?.cardId || e?._id || e?.id) === id);
  if (i >= 0) {
    const prev = cur[i];
    const prevQty = Number(prev.qty) || 0;
    cur[i] = {
      ...prev,
      cardId: prev.cardId || prev._id || prev.id || id,
      qty: Math.max(1, prevQty + (qty || 1)),
    };
  } else {
    cur.push({ cardId: id, qty: Math.max(1, qty || 1) });
  }
  // Patch only extraDeck to avoid touching money/other fields
  await gameService.patchState({ extraDeck: cur }, token);
}
// Apply non-card loot locally (money, statBuff) using PATCH to avoid resets
async function applyNonCardRewardLocal(item, token) {
  const saved = await gameService.loadState(token).catch(() => null);
  if (!saved) return;

  if (item?.kind === 'money') {
    const delta = Number(item?.amount) || 0;
    const nextMoney = (Number(saved.money) || 0) + delta;
    await gameService.patchState({ money: nextMoney }, token);
    return;
  }

  if (item?.kind === 'statBuff') {
    const stat = item?.stat;
    if (!stat) return;
    const delta = Number(item?.amount) || 0;
    const cur = saved.extraStats || {};
    const next = { ...cur, [stat]: (Number(cur[stat]) || 0) + delta };
    await gameService.patchState({ extraStats: next }, token);
    return;
  }
}

/**
 * LootRoom
 * - Auto-apply NON-CARD loot exactly once per room
 * - For cards: preview with CardTile, "Give to…" assigns to teammate; "Skip" removes option
 */
const LootRoom = ({
  room,
  roomId,
  onNext,
  onApplyReward,
}) => {
  const { token } = useContext(AuthContext);
  const rid = room?._id || room?.id || roomId;

  const [cards, setCards] = useState([]);
  const [applyingNonCards, setApplyingNonCards] = useState(false);
  const [cardDocs, setCardDocs] = useState({});
  const appliedNonCardByRoomRef = useRef({}); // { [roomId]: true }
  const onClaim = async (card) => {
    try {
      const cardId = getCardId(card);
      if (onApplyReward) {
        await onApplyReward({ kind: 'card', cardId });
      } else {
        // Fallback: write to run-only extraDeck ourselves
        await appendExtraDeck(cardId, Number(card?.qty) || 1, token);
      }
      setCards(prev => prev.filter(c => c !== card));
      dlog('card claimed & removed from UI');
    } catch (e) {
      dlog('claim failed:', e?.message || e);
    }
  };

  // Loot: only once per room; auto-apply non-cards once
  useEffect(() => {
    if (!rid) return;
    let cancel = false;
    (async () => {
      dlog('fetching loot for room', rid);
      try {
        const data = await getLoot(rid, token).catch(() => null);
        const loot = Array.isArray(data?.loot) ? data.loot : [];
        dlog('loot payload:', loot);

        const nonCards = loot.filter(it => it?.kind !== 'card');
        const cardOnly = loot.filter(it => it?.kind === 'card');
        dlog('partitioned loot -> nonCards:', nonCards, 'cards:', cardOnly);

        const userId = (await gameService.loadState(token).catch(() => null))?.user || 'anon';
        const roomKey = String(rid);
        const globalKey = `${userId}:${roomKey}`;
        const alreadyApplied =
          !!appliedNonCardByRoomRef.current[roomKey] || appliedNonCardGlobal.has(globalKey);
        dlog('non-card already applied?', alreadyApplied);

        if (!alreadyApplied && nonCards.length) {
          setApplyingNonCards(true);
          for (const item of nonCards) {
            try {
              // local, safe applier (PATCH-only)
              const saved = await gameService.loadState(token).catch(() => null);
              if (!saved) continue;

              if (item.kind === 'money') {
                const nextMoney = (Number(saved.money) || 0) + (Number(item.amount) || 0);
                await gameService.patchState({ money: nextMoney }, token); // only sets money
              } else if (item.kind === 'statBuff' && item.stat) {
                const cur = saved.extraStats || {};
                const next = { ...cur, [item.stat]: (Number(cur[item.stat]) || 0) + (Number(item.amount) || 0) };
                await gameService.patchState({ extraStats: next }, token); // only sets extraStats
              }
            } catch (e) {
              console.debug('apply non-card failed:', e?.message || e);
            }
          }
          setApplyingNonCards(false);
          appliedNonCardByRoomRef.current[roomKey] = true;
          appliedNonCardGlobal.add(globalKey);
        }

        if (!cancel) setCards(cardOnly);
      } catch (e) {
        dlog('getLoot failed:', e?.message || e);
        if (!cancel) setCards([]);
      }
    })();
    // DO NOT depend on onApplyReward; it changes identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid, token]);

  // Lazy-load card docs for preview tiles
  useEffect(() => {
    let cancel = false;
    const missing = [];
    for (const c of cards) {
      const id = getCardId(c);
      if (id && !cardDocs[id]) missing.push(id);
    }
    if (!missing.length) return;

    dlog('loading card docs for ids:', missing);
    (async () => {
      const pairs = await Promise.all(
        missing.map(id =>
          api.request(`/api/cards/${id}`, 'GET').then(doc => [id, doc]).catch((e) => {
            dlog('card doc fetch failed', id, e?.message || e);
            return [id, null];
          })
        )
      );
      if (cancel) return;
      setCardDocs(prev => {
        const next = { ...prev };
        for (const [id, doc] of pairs) if (doc) next[id] = doc;
        return next;
      });
      dlog('cardDocs after load:', pairs.map(([id]) => id));
    })();

    return () => { cancel = true; };
  }, [cards, cardDocs]);

  const onSkipCardDirect = (card) => {
    dlog('skipping card via direct button', getCardId(card));
    setCards(prev => prev.filter(c => c !== card));
  };

  return (
    <div
      className="room loot-room"
      style={bgUrl(room) ? { backgroundImage: `url(${bgUrl(room)})`, backgroundSize: 'cover' } : {}}
    >
      <h2>Loot</h2>
      <div className="loot-scroll">
        <ul className="loot-list">
          {cards.map((it, i) => {
            const id = getCardId(it);
            const cardDoc = id ? cardDocs[id] : null;
            const label = cardDoc?.name || it.name || it.cardName || `Card ${id || i + 1}`;
            return (
              <li key={i} className="loot-item">
                <div className="col" style={{ display: 'grid', gap: 8 }}>
                  <div className="loot-card">
                    <CardTile card={cardDoc || { name: label }} variant="mini" />
                  </div>
                  <span className="loot-title">{label}</span>
                  {it.description ? <div className="muted" style={{ marginTop: 2 }}>{it.description}</div> : null}
                </div>

                <div className="row loot-actions" style={{ alignItems: 'start' }}>
                  <button className="primary" onClick={() => onClaim(it)}>Claim</button>
                  <button className="ghost" onClick={() => onSkipCardDirect(it)}>Skip</button>
                </div>
              </li>
            );
          })}
          {!cards.length && !applyingNonCards && <li className="loot-item empty">No loot to claim.</li>}
          {applyingNonCards && <li className="loot-item empty">Applying rewards…</li>}
        </ul>
      </div>
      <div className="room-actions">
        <button className="primary" onClick={() => onNext?.()}>Continue</button>
      </div>
    </div>
  );
};

export default LootRoom;
