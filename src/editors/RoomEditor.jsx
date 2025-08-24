// src/pages/RoomEditor.jsx
import React, { useEffect, useMemo, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import {
  listRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
} from '../api/roomApi';
import * as editorApi from '../api/editorApi'; // getCards/getEnemies/getActors
import '../styles/GamePage.css';

const MAX_BACKGROUNDS = 5;

// TinyImage cap for embedded data:URI is 90KB -> match this in all image embeds
const MAX_IMG_SMALL = { maxW: 512,  maxH: 512,  maxKB: 90 };
const MAX_IMG_BG   = { maxW:1920, maxH:1080, maxKB:400 };

const WORD_LIMIT    = 30;
const MAX_AUDIO_KB  = 3500; // TinyAudio max
const MAX_AUDIO_SEC = 180;

const DEFAULT_ROOM = () => ({
  _id: null,
  name: '',
  type: 'loot',
  backgrounds: [],
  loot: [],
  merchant: { items: [], merchantImg: null, frameImg: null, dialogue: { onEnter: '', onBuy: '', onExit: '' } },
  event: { kind: 'story-only', effects: [], vnText: [], characterImg: null },
  enemyId: '',
  roomAudio: null
});

// ---------- utils ----------
const wordCount = (s) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const estimateKB = (dataUrl) => Math.round(((String(dataUrl).length * 3) / 4) / 1024);

// PNG/JPEG downscale helper that respects TinyImage 90KB cap
const downscaleToImage = (file, { maxW, maxH, maxKB, quality = 0.9 }) =>
  new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      return reject(new Error('Please choose a PNG or JPEG (.png/.jpg)'));
    }
    const isPNG = file.type === 'image/png';
    const mime = isPNG ? 'image/png' : 'image/jpeg';
    const img = new Image();
    const fr = new FileReader();

    fr.onload = () => (img.src = fr.result);
    fr.onerror = () => reject(new Error('Failed to read image file'));

    img.onload = () => {
      let ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const render = (r, q = quality) => {
        const w = Math.max(1, Math.round(img.width * r));
        const h = Math.max(1, Math.round(img.height * r));
        canvas.width = w; canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        if (isPNG) return canvas.toDataURL('image/png');
        // JPEG: binary search quality to target maxKB
        let lo = 0.4, hi = q, best = canvas.toDataURL('image/jpeg', lo);
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) / 2;
          const du = canvas.toDataURL('image/jpeg', mid);
          if (estimateKB(du) <= maxKB) { best = du; lo = mid; } else { hi = mid; }
        }
        return best;
      };

      let dataUrl = render(ratio);
      // For PNG (no quality knob), shrink until under KB budget
      if (estimateKB(dataUrl) > maxKB && isPNG) {
        for (let i = 0; i < 6 && estimateKB(dataUrl) > maxKB; i++) {
          ratio *= 0.85; dataUrl = render(ratio);
        }
      }
      resolve({ dataUrl, mime, sizeKB: estimateKB(dataUrl) });
    };

    img.onerror = () => reject(new Error('Invalid image'));
    fr.readAsDataURL(file);
  });

// Read MP3 as data:URI and probe duration
const asTinyAudio = (file) =>
  new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (file.type !== 'audio/mpeg') return reject(new Error('MP3 only (audio/mpeg)'));
    const sizeKB = Math.round(file.size / 1024);
    if (sizeKB > MAX_AUDIO_KB) return reject(new Error(`Audio too large (> ${MAX_AUDIO_KB}KB)`));
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result;
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = dataUrl;
      audio.onloadedmetadata = () => {
        const durationSec = Math.round(audio.duration || 0);
        if (durationSec > MAX_AUDIO_SEC) return reject(new Error('Audio longer than 3 minutes (180s)'));
        resolve({ mime: 'audio/mpeg', data: dataUrl, sizeKB, durationSec });
      };
      audio.onerror = () => resolve({ mime: 'audio/mpeg', data: dataUrl, sizeKB });
    };
    fr.onerror = () => reject(new Error('Failed to read audio file'));
    fr.readAsDataURL(file);
  });

function InputRow({ label, children, className='' }){
  return (
    <label className={`list-item ${className}`} style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <span style={{ opacity:.85, fontSize:13 }}>{label}</span>
      {children}
    </label>
  );
}
function Section({ title, children }){
  return (
    <section style={{ borderTop:'1px solid #333', paddingTop:12, marginTop:16 }}>
      <h3 style={{ margin:'0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}

// ---- Loot item editor ----
function LootItemRow({ value, onChange, onRemove, cards }) {
  const kind = value.kind || 'money';
  return (
    <div className="row" style={{ gap:8, alignItems:'center' }}>
      <select value={kind} onChange={e => onChange({ ...value, kind: e.target.value })}>
        <option value="money">money</option>
        <option value="statBuff">statBuff</option>
        <option value="card">card</option>
      </select>

      {kind === 'money' && (
        <>
          <span>Amount</span>
          <input type="number" value={value.amount ?? 0} onChange={e => onChange({ ...value, amount: Number(e.target.value) })}/>
        </>
      )}

      {kind === 'statBuff' && (
        <>
          <select value={value.stat || 'attackPower'} onChange={e => onChange({ ...value, stat: e.target.value })}>
            {['attackPower','physicalPower','supernaturalPower','durability','vitality','intelligence','speed'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span>+ </span>
          <input type="number" value={value.amount ?? 0} onChange={e => onChange({ ...value, amount: Number(e.target.value) })}/>
        </>
      )}

      {kind === 'card' && (
        <>
          <span>Card</span>
          <select value={value.cardId || ''} onChange={e => onChange({ ...value, cardId: e.target.value })}>
            <option value="">-- choose card --</option>
            {cards.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </>
      )}

      <button type="button" className="danger" onClick={onRemove}>Remove</button>
    </div>
  );
}

// ---- Merchant item editor ----
function MerchantItemRow({ value, onChange, onRemove, cards }) {
  const kind = value.kind || 'card';
  return (
    <div className="row" style={{ gap:8, alignItems:'center' }}>
      <select value={kind} onChange={e => onChange({ ...value, kind: e.target.value })}>
        <option value="card">card</option>
        <option value="statBuff">statBuff</option>
      </select>

      {kind === 'card' && (
        <>
          <span>Card</span>
          <select value={value.cardId || ''} onChange={e => onChange({ ...value, cardId: e.target.value })}>
            <option value="">-- choose card --</option>
            {cards.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </>
      )}

      {kind === 'statBuff' && (
        <>
          <select
            value={value.stat || 'attackPower'}
            onChange={e => onChange({ ...value, stat: e.target.value })}
          >
            {['attackPower','physicalPower','supernaturalPower','durability','vitality','intelligence','speed']
              .map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span>+ </span>
          <input
            type="number"
            value={(value.value ?? value.amount ?? 0)}
            onChange={e => onChange({ ...value, value: Number(e.target.value) })}
          />
        </>
      )}

      <span>Price</span>
      <input type="number" value={value.price ?? 0} onChange={e => onChange({ ...value, price: Number(e.target.value) })}/>
      <button type="button" className="danger" onClick={onRemove}>Remove</button>
    </div>
  );
}

export default function RoomEditor(){
  const { token } = useContext(AuthContext);
  const [rooms, setRooms] = useState([]);
  const [cards, setCards] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [room, setRoom] = useState(DEFAULT_ROOM());
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');
  // load refs + rooms
  useEffect(() => {
    (async () => {
      if (!token) {
        setRooms([]); setCards([]); setEnemies([]);
        return;
      }
      try {
        const [rs, cs, es] = await Promise.all([
          listRooms(token),
          editorApi.getCards(token),
          editorApi.getEnemies(token),
        ]);
        setRooms(Array.isArray(rs) ? rs : []);
        setCards(Array.isArray(cs) ? cs : []);
        setEnemies(Array.isArray(es) ? es : []);
      } catch {
        // ignore initial load error
      }
    })();
  }, [token]);

  const filteredRooms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rooms.filter(r => (r.name || '').toLowerCase().includes(q)) : rooms;
  }, [rooms, filter]);

  const reset = () => { setRoom(DEFAULT_ROOM()); setMsg(''); };

  const load = async (id) => {
    try {
      const doc = await getRoomById(id, token);
      setRoom({
        _id: doc._id,
        name: doc.name || '',
        type: doc.type || 'loot',
        backgrounds: doc.backgrounds || [],
        loot: doc.loot || [],
        merchant: {
          items: doc.merchant?.items || [],
          merchantImg: doc.merchant?.merchantImg || null,
          frameImg: doc.merchant?.frameImg || null,
          dialogue: {
            onEnter: doc.merchant?.dialogue?.onEnter || '',
            onBuy:   doc.merchant?.dialogue?.onBuy || '',
            onExit:  doc.merchant?.dialogue?.onExit || '',
          }
        },
        event: {
          kind: doc.event?.kind || 'story-only',
          effects: doc.event?.effects || [],
          vnText: doc.event?.vnText || [],
          characterImg: doc.event?.characterImg || null
        },
        enemyId: (doc.enemyId ? String(doc.enemyId)
          : (Array.isArray(doc.enemyIds) && doc.enemyIds.length ? String(doc.enemyIds[0]) : '')),
        roomAudio: doc.roomAudio || null
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setMsg('Failed to load room');
    }
  };

  const removeBackground = (i) => {
    const next = (room.backgrounds || []).slice();
    next.splice(i, 1);
    setRoom({ ...room, backgrounds: next });
  };

  const setDialogue = (k, v) => {
    const dlg = { ...(room.merchant?.dialogue || {}) };
    dlg[k] = v;
    setRoom({ ...room, merchant: { ...room.merchant, dialogue: dlg } });
  };

  const addLoot = () => setRoom({ ...room, loot: [...(room.loot || []), { kind:'money', amount: 10 }] });
  const changeLoot = (i, patch) => {
    const arr = (room.loot || []).slice();
    arr[i] = patch;
    setRoom({ ...room, loot: arr });
  };
  const removeLoot = (i) => {
    const arr = (room.loot || []).slice();
    arr.splice(i, 1);
    setRoom({ ...room, loot: arr });
  };

  const addMerchantItem = () => setRoom({ ...room, merchant: { ...room.merchant, items: [...(room.merchant?.items || []), { kind:'card', cardId:'', price:0 }] } });
  const changeMerchantItem = (i, patch) => {
    const items = (room.merchant?.items || []).slice();
    items[i] = patch;
    setRoom({ ...room, merchant: { ...room.merchant, items } });
  };
  const removeMerchantItem = (i) => {
    const items = (room.merchant?.items || []).slice();
    items.splice(i,1);
    setRoom({ ...room, merchant: { ...room.merchant, items } });
  };

  // Image uploads (PNG or JPEG), embed-size capped at 90KB
  const uploadMerchantImg = async (file) => {
    try {
      const result = await downscaleToImage(file, MAX_IMG_SMALL);
      if (!result) return;
        const { dataUrl, mime, sizeKB } = result;
        setRoom(r => ({ ...r, merchant: { ...r.merchant, merchantImg: { mime, data: dataUrl, sizeKB } } }));
    } catch (e) { setMsg(e.message); }
  };
  const uploadFrameImg = async (file) => {
    try {
      const result = await downscaleToImage(file, MAX_IMG_SMALL);
      if (!result) return;
        const { dataUrl, mime, sizeKB } = result;
        setRoom(r => ({ ...r, merchant: { ...r.merchant, frameImg: { mime, data: dataUrl, sizeKB } } }));
    } catch (e) { setMsg(e.message); }
  };
  const removeMerchantImg = () => setRoom({ ...room, merchant: { ...room.merchant, merchantImg: null } });
  const removeFrameImg = () => setRoom({ ...room, merchant: { ...room.merchant, frameImg: null } });

  const setEvent = (patch) => setRoom({ ...room, event: { ...(room.event || {}), ...patch } });
  const addEffect = () => setEvent({ effects: [...(room.event?.effects || []), { kind:'money', amount:10 }] });
  const changeEffect = (i, patch) => {
    const arr = (room.event?.effects || []).slice();
    arr[i] = patch;
    setEvent({ effects: arr });
  };
  const removeEffect = (i) => {
    const arr = (room.event?.effects || []).slice();
    arr.splice(i,1);
    setEvent({ effects: arr });
  };
  const addVN = () => setEvent({ vnText: [...(room.event?.vnText || []), '' ] });
  const changeVN = (i, text) => {
    const arr = (room.event?.vnText || []).slice();
    arr[i] = text;
    setEvent({ vnText: arr });
  };
  const removeVN = (i) => {
    const arr = (room.event?.vnText || []).slice();
    arr.splice(i,1);
    setEvent({ vnText: arr });
  };

  // combat/boss enemy pickers
  const setEnemyIds = (ids) => setRoom({ ...room, enemyIds: ids });

  // save/delete
  const onSave = async (e) => {
    e?.preventDefault?.();
    setMsg('');

    const tinyImg = (img) =>
      (img?.data && img?.mime) ? { mime: img.mime, data: img.data, ...(img.sizeKB ? { sizeKB: img.sizeKB } : {}) } : null;

    const normLoot = (it) => {
      if (!it || !it.kind) return null;
      if (it.kind === 'money') {
        const amount = Number(it.amount ?? 0);
        return Number.isFinite(amount) ? { kind: 'money', amount } : null;
      }
      if (it.kind === 'statBuff') {
        const stat = it.stat || 'attackPower';
        const amount = Number(it.amount ?? it.value ?? 0);   // accept legacy value
        return Number.isFinite(amount) ? { kind: 'statBuff', stat, amount } : null;
      }
      if (it.kind === 'card') {
        const cardId = it.cardId || '';
        return cardId ? { kind: 'card', cardId } : null;
      }
      return null;
    };

    const normMerchantItem = (it) => {
      if (!it || !it.kind) return null;
      if (it.kind === 'card') {
        const cardId = it.cardId || '';
        const price = Number(it.price ?? 0);
        return (cardId && Number.isFinite(price)) ? { kind: 'card', cardId, price } : null;
      }
      if (it.kind === 'statBuff') {
        const stat = it.stat || 'attackPower';
        const value = Number(it.value ?? it.amount ?? 0); // accept legacy amount, persist as value
        const price = Number(it.price ?? 0);
        return (Number.isFinite(value) && Number.isFinite(price)) ? { kind: 'statBuff', stat, value, price } : null;
      }
      return null;
    };

    try {
      // mirror server validation
      if (room.type === 'merchant' && room.merchant?.dialogue) {
        for (const f of ['onEnter','onBuy','onExit']) {
          const wc = wordCount(room.merchant.dialogue[f] || '');
          if (wc > WORD_LIMIT) throw new Error(`merchant.dialogue.${f} exceeds ${WORD_LIMIT} words`);
        }
      }

      if ((room.type === 'combat' || room.type === 'boss') && !room.enemyId) {
        throw new Error('Please choose an enemy for this room.');
      }

      const payload = {
        name: String(room.name || '').trim(),
        type: room.type,

        backgrounds: (room.backgrounds || [])
          .filter(img => img?.data && img?.mime)
          .map(tinyImg),

        // Loot (optional)
        ...(room.type === 'loot' || (room.loot && room.loot.length) ? {
          loot: (room.loot || []).map(normLoot).filter(Boolean)
        } : {}),

        // Merchant (only when type=merchant)
        ...(room.type === 'merchant' ? {
          merchant: {
            items: (room.merchant?.items || []).map(normMerchantItem).filter(Boolean),
            merchantImg: tinyImg(room.merchant?.merchantImg),
            frameImg: tinyImg(room.merchant?.frameImg),
            dialogue: {
              onEnter: room.merchant?.dialogue?.onEnter || '',
              onBuy:   room.merchant?.dialogue?.onBuy   || '',
              onExit:  room.merchant?.dialogue?.onExit  || '',
            }
          }
        } : {}),

        // Event (only when type=event)
        ...(room.type === 'event' ? {
          event: {
            kind: room.event?.kind || 'story-only',
            effects: (room.event?.effects || []).map(normLoot).filter(Boolean),
            vnText: (room.event?.vnText || []).map(t => String(t || '').trim()).filter(Boolean),
            ...(room.event?.characterImg ? { characterImg: room.event.characterImg } : {})
          }
        } : {}),

        // Room audio (optional)
        ...(room.roomAudio?.data ? {
          roomAudio: {
            mime: 'audio/mpeg',
            data: room.roomAudio.data,
            ...(room.roomAudio.sizeKB ? { sizeKB: room.roomAudio.sizeKB } : {}),
            ...(room.roomAudio.durationSec ? { durationSec: room.roomAudio.durationSec } : {}),
          }
        } : {}),

        // Enemy (single) only for combat/boss
        ...(room.type === 'combat' || room.type === 'boss' ? {
          enemyId: room.enemyId || ''
        } : {})
      };

      // Create or update
      const saved = room._id
        ? await updateRoom(room._id, payload, token)
        : await createRoom(payload, token);

      // Refresh list
      const rs = await listRooms(token);
      setRooms(Array.isArray(rs) ? rs : []);
      setMsg('Saved!');
      if (!room._id) setRoom(r => ({ ...r, _id: saved?._id || r._id }));
    } catch (err) {
      setMsg(err?.message || 'Save failed');
    }
  };

  const onDelete = async () => {
    try {
      if (!room?._id) {
        setMsg('Nothing to delete.');
        return;
      }
      if (!window.confirm('Delete this room?')) return;

      setMsg('Deleting…');
      await deleteRoom(room._id, token);

      // refresh list
      const rs = await listRooms(token);
      setRooms(Array.isArray(rs) ? rs : []);

      // clear current editor state
      setRoom(DEFAULT_ROOM());
      setMsg('Deleted.');
    } catch (err) {
      setMsg(err?.message || 'Delete failed');
    }
  };

  // Helper to guess MIME from a URL extension
  const mimeFromUrl = (url) => (/\.png($|\?)/i.test(url) ? 'image/png' : 'image/jpeg');

  // helper lookups
  const enemyById  = (id) => enemies.find(e => String(e._id) === String(id));

  return (
    <div className="ee-wrap" style={{ display:'grid', gridTemplateColumns:'1.2fr 0.8fr', gap:24, padding:24 }}>
      <form className="ee-form" onSubmit={onSave} style={{ background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:20, color:'#e5e7eb' }}>
        <header className="ee-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <h2>Room Editor</h2>
          <div className="ee-actions">
            <button className="primary" type="submit" disabled={!token} title={!token ? 'Please log in' : ''}>
              {room._id ? 'Update Room' : 'Create Room'}
            </button>
            <button type="button" className="ghost" onClick={reset} style={{ marginLeft:8 }}>New</button>
            {room._id && (
              <button type="button" className="danger" onClick={onDelete} style={{ marginLeft:8 }} disabled={!token} title={!token ? 'Please log in' : ''}>
                Delete
              </button>
            )}
          </div>
        </header>

        <Section title="Core">
          <div className="grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <InputRow label="Name">
              <input value={room.name} onChange={e => setRoom({ ...room, name: e.target.value })} required />
            </InputRow>
            <InputRow label="Type">
              <select value={room.type} onChange={e => setRoom({ ...room, type: e.target.value })}>
                <option value="loot">loot</option>
                <option value="merchant">merchant</option>
                <option value="event">event</option>
                <option value="combat">combat</option>
                <option value="boss">boss</option>
                <option value="rest">rest</option>
              </select>
            </InputRow>
            <InputRow label="Enemy (combat/boss)">
              <select
                value={room.enemyId || ''}
                onChange={e => setRoom({ ...room, enemyId: e.target.value })}
                disabled={!(room.type === 'combat' || room.type === 'boss')}
              >
                <option value="">— choose enemy —</option>
                {enemies.map(en => (
                  <option key={en._id} value={en._id}>
                    {en.name || en._id}
                  </option>
                ))}
              </select>
            </InputRow>
            {/* Backgrounds */}
            <div className="full" style={{ gridColumn:'1 / -1' }}>
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <h4 style={{ margin:'8px 0' }}>
                  Backgrounds (PNG/JPEG ≤ ~400KB when embedded; paste a URL for larger images; up to {MAX_BACKGROUNDS})
                </h4>
              </div>
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={async e=>{
                    try{
                      const f = e.target.files?.[0]; if(!f) return;
                      const res = await downscaleToImage(f, MAX_IMG_BG);
                      if (!res) return;
                      const { dataUrl, mime, sizeKB } = res;
                      const next = [ ...(room.backgrounds || []), { mime, data: dataUrl, sizeKB } ];
                      setRoom(r => ({ ...r, backgrounds: next.length > MAX_BACKGROUNDS ? next.slice(-MAX_BACKGROUNDS) : next }));
                    }catch(err){ setMsg(err?.message||'Upload failed'); }
                    finally{ e.target.value=''; }
                  }}
                />
                <input
                  placeholder="or image URL (http/https)"
                  onKeyDown={(e)=>{
                    if(e.key==='Enter'){
                      e.preventDefault();
                      const url=e.currentTarget.value.trim(); if(!url) return;
                      if (window?.location?.protocol === 'https:' && /^http:\/\//i.test(url)) {
                        setMsg('This image uses http on an https page — the browser will block it. Use an https URL.');
                        return;
                      }
                      const mime = mimeFromUrl(url);
                      setRoom(r => {
                        const next = [ ...(r.backgrounds || []), { mime, data: url, sizeKB: 1 } ];
                        return { ...r, backgrounds: next.length > MAX_BACKGROUNDS ? next.slice(-MAX_BACKGROUNDS) : next };
                      });
                      e.currentTarget.value='';
                    }
                  }}
                />
                <button type="button" className="ghost" onClick={() => setRoom({ ...room, backgrounds: [] })}>Clear All</button>
                <span style={{ color:'#9ca3af' }}>Max {MAX_BACKGROUNDS}</span>
              </div>
              <div className="list" style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:10 }}>
                {(room.backgrounds || []).map((img, i) => (
                  <div key={i} className="list-item" style={{ padding:6 }}>
                    <img src={img?.data} alt="bg" style={{ maxWidth:160, maxHeight:90, display:'block', borderRadius:6 }} />
                    <div className="row" style={{ justifyContent:'space-between', marginTop:6 }}>
                      <small>{img?.sizeKB ?? 0} KB</small>
                      <button type="button" className="danger" onClick={() => removeBackground(i)}>Remove</button>
                    </div>
                  </div>
                ))}
                {!room.backgrounds?.length && <div className="img-placeholder">no backgrounds</div>}
              </div>
            </div>

            {/* Room Audio */}
            <div className="full" style={{ gridColumn:'1 / -1', marginTop:8 }}>
              <h4 style={{ margin:'8px 0' }}>Room Audio (MP3 ≤ 3 minutes, ≤ {MAX_AUDIO_KB}KB)</h4>
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input
                  type="file"
                  accept="audio/mpeg"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const audio = await asTinyAudio(file);
                      setRoom({ ...room, roomAudio: audio });
                    } catch (err) {
                      setMsg(err?.message || 'Audio upload failed');
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
                <input
                  placeholder="or audio URL (.mp3)"
                  onKeyDown={(e)=>{
                    if (e.key === 'Enter') {
                      const url = e.currentTarget.value.trim();
                      if (!url) return;
                      setRoom(r => ({ ...r, roomAudio: { mime:'audio/mpeg', data:url, sizeKB: 1 } }));
                      e.currentTarget.value = '';
                    }
                  }}
                />
                {room.roomAudio && (
                  <>
                    <button type="button" className="danger" onClick={() => setRoom({ ...room, roomAudio: null })}>Clear</button>
                    <small style={{ color:'#9ca3af' }}>
                      {room.roomAudio.sizeKB} KB{room.roomAudio.durationSec ? ` • ${room.roomAudio.durationSec}s` : ''}
                    </small>
                  </>
                )}
              </div>
              {room.roomAudio?.data && (
                <audio controls src={room.roomAudio.data} style={{ width:'100%', marginTop:8 }} />
              )}
            </div>
          </div>
        </Section>

        {room.type === 'loot' && (
          <Section title="Loot (leave empty to use Campaign.randomLoot)">
            <div className="list" style={{ display:'grid', gap:8 }}>
              {(room.loot || []).map((it, i) => (
                <LootItemRow
                  key={i}
                  value={it}
                  onChange={(v) => changeLoot(i, v)}
                  onRemove={() => removeLoot(i)}
                  cards={cards}
                />
              ))}
              <button type="button" className="ghost" onClick={addLoot}>+ Add loot item</button>
            </div>
          </Section>
        )}

        {room.type === 'merchant' && (
          <Section title="Merchant">
            <div className="list" style={{ display:'grid', gap:8 }}>
              {(room.merchant?.items || []).map((it, i) => (
                <MerchantItemRow
                  key={i}
                  value={it}
                  onChange={(v) => changeMerchantItem(i, v)}
                  onRemove={() => removeMerchantItem(i)}
                  cards={cards}
                />
              ))}
              <button type="button" className="ghost" onClick={addMerchantItem}>+ Add item</button>
            </div>

            <div className="grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
              <InputRow label="Merchant Image (PNG/JPEG)">
                <div className="row" style={{ gap:8, alignItems:'center' }}>
                  <input type="file" accept="image/png,image/jpeg" onChange={e => uploadMerchantImg(e.target.files?.[0])}/>
                  <input
                    placeholder="or image URL"
                    onKeyDown={(e)=>{
                      if(e.key==='Enter'){
                        e.preventDefault();
                        const url=e.currentTarget.value.trim(); if(!url) return;
                        const mime = mimeFromUrl(url);
                        setRoom(r => ({ ...r, merchant: { ...r.merchant, merchantImg: { mime, data: url, sizeKB: 1 } } }));
                        e.currentTarget.value='';
                      }
                    }}
                  />
                  {room.merchant?.merchantImg?.data && <button type="button" className="danger" onClick={removeMerchantImg}>Clear</button>}
                </div>
                {room.merchant?.merchantImg?.data && <img src={room.merchant.merchantImg.data} alt="merchant" style={{ maxHeight:160, marginTop:6 }}/>}
              </InputRow>

              <InputRow label="Shopping Frame (PNG/JPEG)">
                <div className="row" style={{ gap:8, alignItems:'center' }}>
                  <input type="file" accept="image/png,image/jpeg" onChange={e => uploadFrameImg(e.target.files?.[0])}/>
                  <input
                    placeholder="or image URL"
                    onKeyDown={(e)=>{
                      if(e.key==='Enter'){
                        e.preventDefault();
                        const url=e.currentTarget.value.trim(); if(!url) return;
                        const mime = mimeFromUrl(url);
                        setRoom(r => ({ ...r, merchant: { ...r.merchant, frameImg: { mime, data: url, sizeKB: 1 } } }));
                        e.currentTarget.value='';
                      }
                    }}
                  />
                  {room.merchant?.frameImg?.data && <button type="button" className="danger" onClick={removeFrameImg}>Clear</button>}
                </div>
                {room.merchant?.frameImg?.data && <img src={room.merchant.frameImg.data} alt="frame" style={{ maxHeight:160, marginTop:6 }}/>}
              </InputRow>

              <div className="full">
                <div className="grid-3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  {['onEnter','onBuy','onExit'].map(k => (
                    <InputRow key={k} label={`Dialogue: ${k} (≤ ${WORD_LIMIT} words)`}>
                      <textarea rows={3} value={room.merchant?.dialogue?.[k] || ''} onChange={e => setDialogue(k, e.target.value)} />
                      <small className="help" style={{ color:'#9ca3af' }}>
                        {wordCount(room.merchant?.dialogue?.[k] || '')} / {WORD_LIMIT} words
                      </small>
                    </InputRow>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}

        {room.type === 'event' && (
          <Section title="Event">
            <div className="grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <InputRow label="Kind">
                <select value={room.event?.kind || 'story-only'} onChange={e => setEvent({ kind: e.target.value })}>
                  <option value="meet-loot">meet-loot</option>
                  <option value="no-meet-loot">no-meet-loot</option>
                  <option value="story-only">story-only</option>
                </select>
              </InputRow>

              {/* meet-loot cosmetic image */}
              {room.event?.kind === 'meet-loot' && (
                <InputRow label="Character Image (PNG/JPEG)">
                  <div className="row" style={{ gap:8, alignItems:'center' }}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]; if (!f) return;
                        try {
                          const res = await downscaleToImage(f, MAX_IMG_SMALL);
                          if (!res) return;
                          const { dataUrl, mime, sizeKB } = res;
                          setEvent({ characterImg: { mime, data: dataUrl, sizeKB } });
                        } catch (err) {
                          setMsg(err?.message || 'Image upload failed');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                    <input
                      placeholder="or image URL"
                      onKeyDown={(e)=>{
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const url = e.currentTarget.value.trim(); if (!url) return;
                          const mime = mimeFromUrl(url);
                          setEvent({ characterImg: { mime, data: url, sizeKB: 1 } });
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    {room.event?.characterImg?.data && (
                      <button type="button" className="danger" onClick={() => setEvent({ characterImg: null })}>Clear</button>
                    )}
                  </div>
                  {room.event?.characterImg?.data && (
                    <img src={room.event.characterImg.data} alt="character" style={{ maxHeight:160, marginTop:6 }} />
                  )}
                </InputRow>
              )}

              <div className="full">
                <h4 style={{ margin:'8px 0' }}>Dialogue</h4>
                <div className="list" style={{ display:'grid', gap:8 }}>
                  {(room.event?.vnText || []).map((t, i) => (
                    <div key={i} className="list-item" style={{ padding:8 }}>
                      <textarea rows={2} value={t} onChange={e => changeVN(i, e.target.value)} />
                      <div className="row" style={{ justifyContent:'flex-end', marginTop:6 }}>
                        <button type="button" className="danger" onClick={() => removeVN(i)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="ghost" onClick={addVN}>+ Add line</button>
                </div>
              </div>

              <div className="full">
                <h4 style={{ margin:'8px 0' }}>Effects (gain/loss like lootroom)</h4>
                <div className="list" style={{ display:'grid', gap:8 }}>
                  {(room.event?.effects || []).map((it, i) => (
                    <LootItemRow
                      key={i}
                      value={it}
                      onChange={(v) => changeEffect(i, v)}
                      onRemove={() => removeEffect(i)}
                      cards={cards}
                    />
                  ))}
                  <button type="button" className="ghost" onClick={addEffect}>+ Add effect</button>
                </div>
              </div>
            </div>
          </Section>
        )}

        {msg && <div className="ee-msg" style={{ marginTop:12, padding:10, background:'#052e16', border:'1px solid #14532d', color:'#a7f3d0', borderRadius:8 }}>{msg}</div>}
      </form>

      <aside className="ee-list" style={{ background:'#0d1117', border:'1px solid #1f2937', borderRadius:10, padding:16, color:'#e5e7eb' }}>
        <div className="list-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <h3>Rooms</h3>
          <button className="ghost" onClick={async () => token && setRooms(await listRooms(token))} disabled={!token} title={!token ? 'Please log in' : ''}>
            ↻ Refresh
          </button>
        </div>
        <input placeholder="filter by name…" value={filter} onChange={e => setFilter(e.target.value)} />
        <ul style={{ listStyle:'none', padding:0, margin:0 }}>
          {filteredRooms.map(r => (
            <li
              key={r._id}
              style={{ borderTop: '1px solid #1f2937', padding: '8px 0' }}
            >
              <button
                className="row"
                onClick={() => load(r._id)}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
              >
                <span className="name" style={{ fontWeight: 600 }}>{r.name}</span>
                <span className="meta" style={{ color: '#9ca3af', fontSize: 12 }}>{r.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
