// src/rooms/MerchantRoom.jsx
import React, { useEffect, useState, useContext, useMemo, useRef } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { buyMerchant, getMerchant } from '../api/roomApi';
import '../styles/GamePage.css';
import gameService from '../services/gameService';
// tiny helpers
const bgUrl = (room) => room?.backgrounds?.[0]?.data || '';
const imgUrl = (img) => img?.data || '';

const Confirm = ({ open, text, onYes, onNo }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal card">
        <div className="modal-body">{text}</div>
        <div className="modal-actions">
          <button className="primary" onClick={onYes}>Confirm</button>
          <button className="ghost" onClick={onNo}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

const MerchantRoom = ({ room, roomId, onNext, onApplyReward }) => {
  const { token } = useContext(AuthContext);
  const rid = room?._id || room?.id || roomId; // support DTO or id
  const [shop, setShop] = useState({ items: [], merchantImg: null, frameImg: null, dialogue: {} });
  const [dialog, setDialog] = useState('enter'); // 'enter' | 'buy' | 'exit'
  const [confirm, setConfirm] = useState({ open: false, index: -1 });
  const [pending, setPending] = useState(null); // reward to resolve after buy
  const lastPriceRef = useRef(0);               // remember price at click time
  // load merchant payload
  useEffect(() => {
    if (!rid) return;
    getMerchant(rid, token)
      .then(data => setShop(data || { items: [] }))
      .catch(() => setShop({ items: [] }));
  }, [rid, token]);

  // Spend run money (mirrors legacy gold). Uses SavedGame.money (or gold if missing).
  async function spendMoney(amount, token) {
    const saved = await gameService.loadState(token).catch(() => null);
    const current = Number(saved?.money ?? saved?.gold ?? 0);
    const next = Math.max(0, current - Number(amount || 0));
    await gameService.saveState({ money: next, gold: next }, token);
  }

  // Append to run-only extraDeck
  async function appendExtraDeck(cardId, qty = 1, token) {
    if (!cardId) return;
    const saved = await gameService.loadState(token).catch(() => null);
    const cur = Array.isArray(saved?.extraDeck) ? saved.extraDeck.slice() : [];
    const id = String(cardId);
    const i = cur.findIndex(e => String(e?.cardId || e?._id || e?.id) === id);
    if (i >= 0) {
      const prev = cur[i];
      const prevQty = Number(prev.qty) || 0;
      cur[i] = { ...prev, cardId: prev.cardId || prev._id || prev.id || id, qty: Math.max(1, prevQty + (qty || 1)) };
    } else {
      cur.push({ cardId: id, qty: Math.max(1, qty || 1) });
    }
    await gameService.patchState({ extraDeck: cur }, token);
  }

  // Additive stat delta to run-only extraStats (can be negative)
  async function addExtraStat(stat, delta, token) {
    if (!stat) return;
    const saved = await gameService.loadState(token).catch(() => null);
    const cur = (saved && typeof saved.extraStats === 'object') ? { ...saved.extraStats } : {};
    const prev = Number(cur[stat] || 0);
    cur[stat] = prev + Number(delta || 0);
    await gameService.patchState({ extraStats: cur }, token);
  }

  const handleBuy = async (index) => {
    setConfirm({ open: false, index: -1 });
    try {
      const res = await buyMerchant(rid, Number(index), token);
      if (res?.reward) {
        setDialog('buy');
        setPending({ ...res.reward, _price: lastPriceRef.current });
      }
      // refresh shop view (e.g., stock/money changes)
      const updated = await getMerchant(rid, token).catch(() => null);
      if (updated) setShop(updated);
    } catch (e) {
      setDialog('buy'); // brief feedback; could show error UI if desired
    }
  };

  // When a reward is present, resolve it (card → choose character, buff → bubble up)
  const rewardKind = pending?.kind;
  const onResolveBuff = () => {
    if (onApplyReward) {
      onApplyReward(pending);
    } else {
      // Fallback: apply locally only if no handler was provided
      addExtraStat(pending?.stat, pending?.value, token)
        .then(() => spendMoney(pending?._price || 0, token))
        .catch(() => {});
    }
    setPending(null);
  };

  const onResolveCard = () => {
    if (onApplyReward) {
      onApplyReward({ kind: 'card', cardId: pending.cardId });
    } else {
      // Fallback: apply locally only if no handler was provided
      appendExtraDeck(pending?.cardId, Number(pending?.qty) || 1, token)
        .then(() => spendMoney(pending?._price || 0, token))
        .catch(() => {});
    }
    setPending(null);
  };

  const dialogueText = useMemo(() => {
    const d = shop.dialogue || {};
    if (dialog === 'enter') return d.onEnter || '';
    if (dialog === 'buy')   return d.onBuy   || '';
    if (dialog === 'exit')  return d.onExit  || '';
    return '';
  }, [shop.dialogue, dialog]);

  const bg = bgUrl(room);
  return (
    <div
      className="room merchant-room"
      style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: 'cover' } : {}}
    >
      <div className="merchant-layer">
        {imgUrl(shop.frameImg) && (
          <img className="merchant-frame" src={imgUrl(shop.frameImg)} alt="frame" />
        )}
        {imgUrl(shop.merchantImg) && (
          <img className="merchant-npc" src={imgUrl(shop.merchantImg)} alt="merchant" />
        )}
        <div className="merchant-dialogue">{dialogueText}</div>
      </div>

      <h2>Merchant</h2>
      <ul className="shop-list">
        {shop.items.map((it, i) => (
          <li key={i} className="shop-item">
            <div className="row">
              <span className="name">
                {it.kind === 'card' ? `Card: ${it.cardId}` : `Buff: +${it.value} ${it.stat}`}
              </span>
              <span className="price">{it.price ?? 0} gold</span>
            </div>
            <button
              className="primary"
              onClick={() => {
                lastPriceRef.current = Number(it?.price || 0);
                setConfirm({ open: true, index: i });
              }}
            >
              Buy
            </button>
          </li>
        ))}
        {!shop.items?.length && <li className="shop-item empty">Nothing for sale…</li>}
      </ul>

      <div className="room-actions">
        <button
          className="ghost"
          onClick={() => {
            setDialog('exit');
            onNext?.();
          }}
        >
          Leave
        </button>
      </div>

      <Confirm
        open={confirm.open}
        text="Purchase this item?"
        onYes={() => handleBuy(confirm.index)}
        onNo={() => setConfirm({ open: false, index: -1 })}
      />

      {/* Reward resolution */}
      {rewardKind === 'card' && (
        <Confirm
          open
          text={`Take card ${pending.cardId}?`}
          onYes={onResolveCard}
          onNo={() => setPending(null)}
        />
      )}
      {rewardKind === 'statBuff' && (
        <Confirm
          open
          text={`Gain +${pending.value} ${pending.stat}?`}
          onYes={onResolveBuff}
          onNo={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default MerchantRoom;
