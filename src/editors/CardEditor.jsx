// src/pages/CardEditor.jsx
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/CardEditor.css'; // dedicated stylesheet
import * as editorApi from '../api/editorApi';

// ----- helpers -----
const TYPE_OPTIONS = ['Attack','Supernatural','Physical','Buff','Debuff','Utility']; // must match schema
const RATING_OPTIONS = ['N','R','G','U'];
const ABILITY_TYPES = [
  'None','Stats Up','Stats Down','Freeze','Unluck','Curse','Lucky','Guard',
  'Ability Shield','Revive','Durability Negation','Ability Negation','Instant Death','Multi-Hit'
];
const ATTACK_TYPES = ['Single','AoE'];
const TARGETING_MODES = ['lock','retarget-random','retarget-choose'];
const TARGETING_SCOPES = ['character','onField-opponent','onField-any'];
const MAX_ABILITIES = 8;
// Allowed targets for Stats Up/Down in schema
const STAT_TARGETS = ['attackPower','physicalPower','supernaturalPower','durability','speed'];

const emptyAbility = () => ({
  type: 'None',
  key: '',
  desc: '',
  attackType: 'Single',
  power: 0,
  duration: 0,
  activationChance: 100,
  precedence: 0,
  linkedTo: [],
  multiHit: { turns: 0, link: 'attack', overlap: 'inherit', schedule: { type: 'random', times: 1 }, targeting: { mode: 'lock', scope: 'character' } },
  durabilityNegation: { auto: true, schedule: { type: 'random', times: 1 } }
});

const defaultCard = {
  _id: null,
  name: '',
  types: ['Attack'],
  rating: 'N',
  imageUrl: '',
  descThumbUrl: '',
  description: '',
  potency: 0,
  defense: 0,
  spCost: 0,
  defaultAttackType: 'Single',
  abilities: [],
  cardEffect: null
};

const urlOrEmpty = (s) => (s || '').trim();
const parseCSVNums = (s) =>
  (s || '').split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);

// Turn a File into a data:URL
const fileToDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result || ''));
  r.onerror = rej;
  r.readAsDataURL(file);
});

// Normalize server cardEffect for this editor (accepts legacy {kind:'image'|'audio'})
const normalizeCardEffectForUI = (ce) => {
  if (!ce) return null;
  if (ce.kind === 'image') {
    return { visual: { mime: ce.mime || 'image/jpeg', data: ce.data, sizeKB: ce.sizeKB } };
  }
  if (ce.kind === 'audio') {
    return { audio: { mime: 'audio/mpeg', data: ce.data, sizeKB: ce.sizeKB, durationSec: ce.durationSec } };
  }
  return ce; // already { visual?, audio? }
};

const PreviewImg = ({ src, alt }) => (
  <div className="img-preview">{src ? <img src={src} alt={alt} /> : <div className="img-placeholder">no image</div>}</div>
);

export default function CardEditor() {
  const { token } = useContext(AuthContext);
  const [card, setCard] = useState(defaultCard);
  const [cards, setCards] = useState([]);
  const [msg, setMsg] = useState('');

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const loadCards = async () => {
    try {
      if (!token) {
        setCards([]);
        setMsg('Please log in to view and edit your cards.');
        return;
      }
      const data = await editorApi.getCards(token); // no scope: server returns yours
      if (Array.isArray(data)) setCards(data);
      setMsg('');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => { loadCards(); /* on mount & when token changes */ }, [token]);

  const resetForm = () => setCard(defaultCard);

  // ---------- media helpers ----------
  // PNG/JPEG downscale helper (keeps PNG alpha; compresses JPEG)
  const downscaleToImage = (
    file,
    { maxW = 1920, maxH = 1080, maxKB = 400, quality = 0.9 } = {}
  ) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        return reject(new Error('Please choose a PNG or JPEG (.png/.jpg)'));
      }
      const isPNG = file.type === 'image/png';
      const mime = isPNG ? 'image/png' : 'image/jpeg';
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => { img.src = fr.result; };
      fr.onerror = () => reject(new Error('Failed to read image'));
      img.onload = () => {
        const baseRatio = Math.min(maxW / img.width, maxH / img.height, 1);
        let ratio = baseRatio;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const estimateKB = du => Math.round(((du.length * 3) / 4) / 1024);

        const renderAt = (r, q = quality) => {
          const w = Math.max(1, Math.round(img.width * r));
          const h = Math.max(1, Math.round(img.height * r));
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          if (isPNG) return canvas.toDataURL('image/png');
          // JPEG quality binary search
          let lo = 0.5, hi = q, best = canvas.toDataURL('image/jpeg', lo);
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            const du = canvas.toDataURL('image/jpeg', mid);
            if (estimateKB(du) <= maxKB) { best = du; lo = mid; } else { hi = mid; }
          }
          return best;
        };

        let dataUrl = renderAt(ratio);
        if (estimateKB(dataUrl) > maxKB && isPNG) {
          // no quality knob—shrink dimensions until under budget
          for (let i = 0; i < 4 && estimateKB(dataUrl) > maxKB; i++) {
            ratio *= 0.85;
            dataUrl = renderAt(ratio);
          }
        }
        resolve({ dataUrl, mime });
      };
      img.onerror = () => reject(new Error('Invalid image'));
      fr.readAsDataURL(file);
    });

  // Downscale + center-crop to an exact box (like CSS object-fit: cover)
  const downscaleCoverTo = (
    file,
    { boxW = 300, boxH = 272, maxKB = 160, preferJPEG = true, quality = 0.9 } = {}
  ) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      return reject(new Error('Please choose a PNG or JPEG (.png/.jpg)'));
    }

    const isPNGIn = /png$/i.test(file.type);
    const mimeOut = preferJPEG ? 'image/jpeg' : (isPNGIn ? 'image/png' : 'image/jpeg');

    const img = new Image();
    const fr = new FileReader();

    fr.onload = () => { img.src = fr.result; };
    fr.onerror = () => reject(new Error('Failed to read image'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Compute source crop area to cover the destination box
      const scale = Math.max(boxW / img.width, boxH / img.height);
      const srcW = Math.round(boxW / scale);
      const srcH = Math.round(boxH / scale);
      const sx = Math.max(0, Math.round((img.width  - srcW) / 2));
      const sy = Math.max(0, Math.round((img.height - srcH) / 2));

      canvas.width = boxW;
      canvas.height = boxH;
      ctx.clearRect(0, 0, boxW, boxH);
      ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, boxW, boxH);

      // Encode with light size control
      const toDU = (q) => (mimeOut === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', q));
      const estimateKB = (du) => Math.round(((du.length * 3) / 4) / 1024);
      let dataUrl = toDU(quality);

      if (mimeOut === 'image/jpeg') {
        // dial quality down if needed
        let lo = 0.6, hi = quality, best = dataUrl;
        for (let i = 0; i < 5 && estimateKB(best) > maxKB; i++) {
          const mid = (lo + hi) / 2;
          const du = toDU(mid);
          if (estimateKB(du) <= maxKB) { best = du; lo = mid; } else { hi = mid; }
        }
        dataUrl = best;
      }
      resolve({ dataUrl, mime: mimeOut });
    };

    img.onerror = () => reject(new Error('Invalid image'));
    fr.readAsDataURL(file);
  });

  const asTinyAudio = (file, { maxKB = 200, maxSec = 5 } = {}) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.type !== 'audio/mpeg') return reject(new Error('MP3 only (.mp3)'));
      const sizeKB = Math.round(file.size / 1024);
      if (sizeKB > maxKB) return reject(new Error(`Audio too large (> ${maxKB}KB)`));
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = fr.result;
        const audio = new Audio();
        audio.preload = 'metadata'; audio.src = dataUrl;
        audio.onloadedmetadata = () => {
          const durationSec = Math.round(audio.duration || 0);
          if (durationSec > maxSec) return reject(new Error(`Audio longer than ${maxSec}s`));
          resolve({ mime:'audio/mpeg', data: dataUrl, sizeKB, durationSec });
        };
        audio.onerror = () => resolve({ mime:'audio/mpeg', data: dataUrl, sizeKB });
      };
      fr.onerror = () => reject(new Error('Failed to read audio'));
      fr.readAsDataURL(file);
    });

  const upsert = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!token) { setMsg('Please sign in first.'); return; }

    // Pre-submit guard for required description
    const desc = (card.description || '').trim();
    if (!desc) { setMsg('Description is required.'); return; }
    // Require Physical or Supernatural when Potency or Defense > 0
    const atk = Number(card.potency) || 0;
    const def = Number(card.defense) || 0;
    const needsType = atk > 0 || def > 0;
    const hasPhysOrSup = Array.isArray(card.types) && (card.types.includes('Physical') || card.types.includes('Supernatural'));
    if (needsType && !hasPhysOrSup) {
      setMsg('When Potency or Defense > 0, you must check either “Physical” or “Supernatural” in Types.');
      return;
    }

    // build payload matching controller expectations
    const payload = {
      name: card.name,
      // include both aliases to be schema-compatible
      type: card.types,
      types: card.types,
      rating: card.rating,
      // permit data URLs or http(s) URLs for art/thumb
      imageUrl: urlOrEmpty(card.imageUrl),
      descThumbUrl: urlOrEmpty(card.descThumbUrl),
      description: desc,
      potency: Number(card.potency) || 0,
      defense: Number(card.defense) || 0,
      spCost: Number(card.spCost) || 0,
      defaultAttackType: card.defaultAttackType,
      abilities: (card.abilities || []).map(a => {
        const out = {
          type: a.type,
          key: a.key || undefined,
          desc: a.desc || undefined,
          power: Number(a.power) || 0,
          duration: Number(a.duration) || 0,
          activationChance: Number(a.activationChance) || 0,
          precedence: Number(a.precedence) || 0,
          linkedTo: (a.linkedTo || []).filter(Boolean),
        };
        // Only non–Multi-Hit abilities carry their own attackType
        if (a.type !== 'Multi-Hit') out.attackType = a.attackType;
        // Multi-Hit does not own power/duration; force to 0 to overwrite old values on update
        if (a.type === 'Multi-Hit') {
          out.power = 0;
          out.duration = 0;
        }
        // 'Stats Up/Down' target (schema-limited)
        if ((a.type === 'Stats Up' || a.type === 'Stats Down') && STAT_TARGETS.includes(a.target)) {
          out.target = a.target;
        }

        // Multi-Hit only if turns >= 1
        const turns = Number(a?.multiHit?.turns) || 0;
        if (a.type === 'Multi-Hit' && turns >= 1) {
          const schedule = a.multiHit?.schedule?.type === 'list'
            ? { type: 'list', turns: Array.isArray(a.multiHit.schedule.turns) ? a.multiHit.schedule.turns : [] }
            : { type: 'random', times: Number(a.multiHit?.schedule?.times) || 1 };
          out.multiHit = {
            turns,
            link: 'attack', // ← enforce MH repeats the base attack only
            overlap: a?.multiHit?.overlap || 'inherit',
            schedule,
            targeting: {
              mode: a?.multiHit?.targeting?.mode || 'lock',
              scope: a?.multiHit?.targeting?.scope || 'character'
            }
          };
        }
        // Durability Negation schedule
        const dn = a.durabilityNegation || {};
        out.durabilityNegation = {
          auto: dn.auto !== false,
          schedule: dn.schedule?.type === 'list'
            ? { type: 'list', turns: Array.isArray(dn.schedule.turns) ? dn.schedule.turns : [] }
            : { type: 'random', times: Number(dn.schedule?.times) || 1 }
        };
        return out;
      }),
      // include cardEffect in payload (server validates again)
      cardEffect: card.cardEffect || undefined
    };

    try {
      if (card._id) {
        await editorApi.updateCard(card._id, payload, token); // PATCH
      } else {
        await editorApi.createCard(payload, token); // POST
      }
      await loadCards();
      if (!card._id) resetForm();
      setMsg('Saved!');
    } catch (e2) {
      setMsg('Error: ' + e2.message);
    }
  };

  const loadIntoForm = (c) => {
    setCard({
      _id: c._id,
      name: c.name,
      // tolerate legacy {type:string} vs {types:string[]}
      types: Array.isArray(c?.type) ? c.type : Array.isArray(c?.types) ? c.types : [c?.type].filter(Boolean),
      rating: c.rating,
      imageUrl: c.imageUrl || '',
      descThumbUrl: c.descThumbUrl || '',
      description: c.description || '',
      potency: c.potency ?? 0,
      defense: c.defense ?? 0,
      spCost: c.spCost ?? 0,
      defaultAttackType: c.defaultAttackType || 'Single',
      abilities: Array.isArray(c.abilities) ? c.abilities.map(a => ({
        type: a.type || 'None',
        key: a.key || '',
        desc: a.desc || '',
        attackType: a.attackType || 'Single',
        power: a.power ?? 0,
        duration: a.duration ?? 0,
        activationChance: a.activationChance ?? 100,
        precedence: a.precedence ?? 0,
        linkedTo: Array.isArray(a.linkedTo) ? a.linkedTo : [],
        // include target if present (Stats Up/Down)
        target: a.target && STAT_TARGETS.includes(a.target) ? a.target : '',
        multiHit: {
          turns: a?.multiHit?.turns ?? 0,
          link: 'attack',
          overlap: a?.multiHit?.overlap || 'inherit',
          schedule: a?.multiHit?.schedule?.type === 'list'
            ? { type: 'list', turns: a.multiHit.schedule.turns || [] }
            : { type: 'random', times: a?.multiHit?.schedule?.times ?? 1 },
          targeting: {
            mode: a?.multiHit?.targeting?.mode || 'lock',
            scope: a?.multiHit?.targeting?.scope || 'character'
          }
        },
        durabilityNegation: {
          auto: a?.durabilityNegation?.auto !== false,
          schedule: a?.durabilityNegation?.schedule?.type === 'list'
            ? { type: 'list', turns: a.durabilityNegation.schedule.turns || [] }
            : { type: 'random', times: a?.durabilityNegation?.schedule?.times ?? 1 }
        }
      })) : [],
      // load/normalize existing cardEffect for editor
      cardEffect: normalizeCardEffectForUI(c.cardEffect)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeCard = async (id) => {
    if (!id) return;
    if (!confirm('Delete this card?')) return;
    try {
      if (!token) { setMsg('Please sign in to delete.'); return; }
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE', headers: { ...authHeader } });
      if (res.ok) { await loadCards(); if (card._id === id) resetForm(); }
    } catch { /* ignore */ }
  };

  // --- UI helpers ---
  const setTypeChecked = (t, checked) => {
    const set = new Set(card.types);
    if (checked) set.add(t); else set.delete(t);
    const next = Array.from(set);
    setCard({ ...card, types: next.length ? next : ['Attack'] });
  };

  const updateAbility = (i, patch) => {
    const next = card.abilities.slice();
    next[i] = { ...next[i], ...patch };
    setCard({ ...card, abilities: next });
  };

  const addAbility = () => {
    if ((card.abilities || []).length >= MAX_ABILITIES) return;
    setCard({ ...card, abilities: [ ...(card.abilities || []), emptyAbility() ] });
  };

  const removeAbility = (idx) => {
    const next = (card.abilities || []).filter((_, i) => i !== idx);
    setCard({ ...card, abilities: next });
  };
  // Build link candidates: special 'attack' + all other ability keys
  const linkCandidates = (selfIdx) => {
    const keys = (card.abilities || [])
      .map((a, j) => (j !== selfIdx ? (a?.key || '').trim() : ''))
      .filter(Boolean);
    return ['attack', ...Array.from(new Set(keys))];
  };

  // Safely rename an ability key and propagate to other abilities' linkedTo
  const renameAbilityKey = (idx, nextKeyRaw) => {
    const nextKey = (nextKeyRaw || '').trim();
    const prevKey = (card.abilities?.[idx]?.key || '').trim();
    if (prevKey === nextKey) return;

    const next = (card.abilities || []).map((a) => ({ ...a }));
    // Update this ability's key
    next[idx].key = nextKey;

    // Propagate to others' linkedTo
    for (let j = 0; j < next.length; j++) {
      if (j === idx) continue;
      const lt = Array.isArray(next[j].linkedTo) ? next[j].linkedTo.slice() : [];
      if (prevKey && lt.includes(prevKey)) {
        const set = new Set(lt);
        set.delete(prevKey);
        if (nextKey) set.add(nextKey);
        next[j].linkedTo = Array.from(set);
      }
    }
    setCard({ ...card, abilities: next });
  };
  // Toggle linking from the MH panel: link the TARGET ability to the MH ability's KEY
  const toggleLinkedUnderMH = (mhIdx, targetIdx, checked) => {
    const mh = card.abilities?.[mhIdx]; if (!mh) return;
    const mhKey = (mh?.key || '').trim();           // ← link to MH key only
    if (!mhKey) return;                             // require a key to link
    const next = (card.abilities || []).map(a => ({ ...a }));
    const tgt = next[targetIdx]; if (!tgt) return;
    const set = new Set(Array.isArray(tgt.linkedTo) ? tgt.linkedTo : []);
    if (checked) set.add(mhKey); else set.delete(mhKey);
    tgt.linkedTo = Array.from(set);
    setCard({ ...card, abilities: next });
  };
  // Choose which single event this MH repeats (attack or an ability key).
  // Uses checkboxes but enforces a single selection (radio-like).
  const setMHEvent = (mhIdx, opt, checked) => {
    const next = (card.abilities || []).map(a => ({ ...a }));
    const mh = next[mhIdx]; if (!mh) return;
    const current = mh?.multiHit?.link || 'attack';
    const nextLink = checked ? opt : (current === opt ? 'attack' : current);
    mh.multiHit = { ...(mh.multiHit || {}), link: nextLink };
    setCard({ ...card, abilities: next });
  };

  // Quick count for primary Multi-Hit (turns >= 1)
  const countActiveMultiHit = () =>
    (card.abilities || []).filter(a => a?.type === 'Multi-Hit' && Number(a?.multiHit?.turns) >= 1).length;

  // --- render ---
  return (
    <div className="ce-wrap">
      <form className="ce-form" onSubmit={upsert}>
        <header className="ce-header">
          <h2>Card Editor</h2>
          <div className="ce-actions">
            <button
              type="submit"
              className="primary"
              disabled={
                !token ||
                (
                  (Number(card.potency) > 0 || Number(card.defense) > 0) &&
                  !(card.types.includes('Physical') || card.types.includes('Supernatural'))
                )
              }
            >
              {card._id ? 'Update Card' : 'Create Card'}
            </button>
            <button type="button" onClick={resetForm} className="ghost">New</button>
          </div>
        </header>

        <div className="row" style={{ gap:8, marginBottom:12 }}>
          <button
            type="button"
            className="ghost"
            onClick={loadCards}
            disabled={!token}
            title={!token ? 'Please log in' : ''}
          >
            ↻ Refresh
          </button>
        </div>

        <section className="ce-section">
          <h3>Core Info</h3>
          <div className="grid-2">
            <label>Card Name
              <input required value={card.name} onChange={e => setCard({ ...card, name: e.target.value })} />
            </label>

            <label>Rating
              <select value={card.rating} onChange={e => setCard({ ...card, rating: e.target.value })}>
                {RATING_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>

            <fieldset className="types">
              <legend>Types <small className="help">Must match schema options</small></legend>
              {TYPE_OPTIONS.map(t => (
                <label key={t} className="chk">
                  <input type="checkbox" checked={card.types.includes(t)} onChange={e => setTypeChecked(t, e.target.checked)} />
                  {t}
                </label>
              ))}
            </fieldset>
            {((Number(card.potency) > 0 || Number(card.defense) > 0) &&
              !(card.types.includes('Physical') || card.types.includes('Supernatural'))) && (
              <div className="validation-warn" style={{ color:'#f59e0b', marginTop:4 }}>
                When Potency or Defense &gt; 0, select either <b>Physical</b> or <b>Supernatural</b>.
              </div>
            )}
            <label>Default Attack Targeting
              <select value={card.defaultAttackType} onChange={e => setCard({ ...card, defaultAttackType: e.target.value })}>
                {ATTACK_TYPES.map(a => <option key={a}>{a}</option>)}
              </select>
              <small className="help">Used when abilities link to this card’s base “attack”.</small>
            </label>
          </div>

          {/* Required Description field */}
          <label className="full">
            Description
            <textarea
              required
              rows={3}
              value={card.description}
              onChange={e => setCard({ ...card, description: e.target.value })}
              placeholder="What does this card do? Flavor + mechanics."
            />
          </label>
        </section>

        {/* --------- Artwork --------- */}
        <section className="ce-section">
          <h3>Artwork</h3>
          <div className="grid-2">
            <label className="full">Main Art (PNG/JPEG ≤ ~90KB, ≤ 512×512)
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input type="file" accept="image/png,image/jpeg" onChange={async (e)=>{
                  try {
                    const f = e.target.files?.[0]; if (!f) return;
                    const { dataUrl } = await downscaleCoverTo(f, { boxW: 300, boxH: 272, maxKB: 160 });
                    setCard(c => ({ ...c, imageUrl: dataUrl }));
                  } catch(err){ setMsg(err?.message || 'Upload failed'); }
                  finally { e.target.value=''; }
                }} />
                <input placeholder="or paste image URL" value={card.imageUrl || ''} onChange={e=>setCard(c=>({...c,imageUrl:e.target.value}))} />
                {card.imageUrl && <button type="button" className="danger" onClick={()=>setCard(c=>({...c,imageUrl:''}))}>Clear</button>}
              </div>
              {card.imageUrl && <img alt="" src={card.imageUrl} style={{ marginTop:8, maxWidth:'100%', border:'1px solid #1f2937', borderRadius:8 }} />}
            </label>

            <label className="full">Desc Button (PNG/JPEG ≤ ~90KB, ≤ 512×512)
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input type="file" accept="image/png,image/jpeg" onChange={async (e)=>{
                  try {
                    const f = e.target.files?.[0]; if (!f) return;
                    // FIX: destructure downscale result
                    const { dataUrl } = await downscaleToImage(f, { maxW:512, maxH:512, maxKB:90 });
                    setCard(c => ({ ...c, descThumbUrl: dataUrl }));
                  } catch(err){ setMsg(err?.message || 'Upload failed'); }
                  finally { e.target.value=''; }
                }} />
                <input placeholder="or paste image URL" value={card.descThumbUrl || ''} onChange={e=>setCard(c=>({...c,descThumbUrl:e.target.value}))} />
                {card.descThumbUrl && <button type="button" className="danger" onClick={()=>setCard(c=>({...c,descThumbUrl:''}))}>Clear</button>}
              </div>
              {card.descThumbUrl && <img alt="" src={card.descThumbUrl} style={{ marginTop:8, maxWidth:256, border:'1px solid #1f2937', borderRadius:8 }} />}
            </label>
          </div>
        </section>

        {/* --------- Card Effect (visual + optional audio) --------- */}
        <section className="ce-section">
          <h3>Card Effect</h3>
          <div className="grid-2">
            {/* Visual */}
            <fieldset className="full">
              <legend>Visual</legend>
              <div className="row" style={{ gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <label className="chk">
                  <input
                    type="radio"
                    name="visualKind"
                    checked={(card.cardEffect?.visual?.mime || 'image/jpeg') !== 'image/gif'}
                    onChange={() => {
                      const v = card.cardEffect?.visual || {};
                      const mime = v.mime === 'image/gif' ? 'image/jpeg' : (v.mime || 'image/jpeg');
                      setCard(c => ({ ...c, cardEffect: { ...(c.cardEffect||{}), visual: { ...v, mime } } }));
                    }}
                  />
                  Static (JPG/PNG)
                </label>
                <label className="chk">
                  <input
                    type="radio"
                    name="visualKind"
                    checked={card.cardEffect?.visual?.mime === 'image/gif'}
                    onChange={() => {
                      const v = card.cardEffect?.visual || {};
                      setCard(c => ({ ...c, cardEffect: { ...(c.cardEffect||{}), visual: { ...v, mime:'image/gif' } } }));
                    }}
                  />
                  Animated GIF
                </label>
              </div>
              <div className="row" style={{ gap:8, alignItems:'center', marginTop:8 }}>
                <input
                  type="file"
                  accept={card.cardEffect?.visual?.mime === 'image/gif' ? 'image/gif' : 'image/png,image/jpeg'}
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0]; if (!f) return;
                      const isGif = f.type === 'image/gif';
                      const { dataUrl, mime } = isGif
                        ? { dataUrl: await fileToDataURL(f), mime: 'image/gif' }
                        : await downscaleToImage(f, { maxW:512, maxH:512, maxKB:90 });
                      const sizeKB = Math.ceil((f.size || 0)/1024);
                      setCard(c => ({
                        ...c,
                        cardEffect: { ...(c.cardEffect||{}), visual: { mime, data: dataUrl, sizeKB } }
                      }));
                    } catch (err) {
                      setMsg(err?.message || 'Upload failed');
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
                <input
                  placeholder="or paste JPG/GIF URL"
                  defaultValue={card.cardEffect?.visual?.data || ''}
                  onBlur={(e) => {
                    const url = e.target.value.trim(); if (!url) return;
                    const isGIF = /\.gif($|\?)/i.test(url);
                    const isPNG = /\.png($|\?)/i.test(url);
                    const isJPG = /\.(jpe?g)($|\?)/i.test(url);
                    if (!isGIF && !isPNG && !isJPG) { setMsg('URL must end with .png/.jpg/.jpeg or .gif'); return; }
                    const mime = isGIF ? 'image/gif' : (isPNG ? 'image/png' : 'image/jpeg');
                    setCard(c => ({
                     ...c,
                      cardEffect: { ...(c.cardEffect||{}), visual: { mime, data: url, sizeKB: 1 } }
                    }));
                  }}
                />
                {card.cardEffect?.visual && (
                  <button type="button" className="danger" onClick={() => {
                    const ce = { ...(card.cardEffect || {}) }; delete ce.visual; setCard(c => ({ ...c, cardEffect: Object.keys(ce).length ? ce : null }));
                  }}>Remove Visual</button>
                )}
              </div>
              {card.cardEffect?.visual?.data && (
                <img alt="" src={card.cardEffect.visual.data} style={{ marginTop:8, maxWidth:256, border:'1px solid #1f2937', borderRadius:8 }} />
              )}
              <small className="help">JPEG/PNG ≤ ~90KB (when embedded). GIF ≤ ~300KB (when embedded). URLs are OK.</small>
            </fieldset>

            {/* Audio (optional) */}
            <fieldset className="full">
              <legend>Audio (optional, MP3 ≤ 5s)</legend>
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input
                  type="file"
                  accept="audio/mpeg"
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0]; if (!f) return;
                      const a = await asTinyAudio(f);
                      setCard(c => ({ ...c, cardEffect: { ...(c.cardEffect||{}), audio: a } }));
                    } catch (err) {
                      setMsg(err?.message || 'Audio upload failed');
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
                <input
                  placeholder="or paste MP3 URL"
                  defaultValue={card.cardEffect?.audio?.data || ''}
                  onBlur={(e) => {
                    const url = e.target.value.trim(); if (!url) return;
                    if (!/\.mp3($|\?)/i.test(url)) { setMsg('URL must end with .mp3'); return; }
                    setCard(c => ({ ...c, cardEffect: { ...(c.cardEffect||{}), audio: { mime:'audio/mpeg', data:url, sizeKB: 1 } } }));
                  }}
                />
                {card.cardEffect?.audio && (
                  <button type="button" className="danger" onClick={() => {
                    const ce = { ...(card.cardEffect || {}) }; delete ce.audio; setCard(c => ({ ...c, cardEffect: Object.keys(ce).length ? ce : null }));
                  }}>Remove Audio</button>
                )}
              </div>
              {card.cardEffect?.audio?.data && (
                <audio controls src={card.cardEffect.audio.data} style={{ marginTop:8, width:'100%' }} />
              )}
            </fieldset>
          </div>
        </section>

        <section className="ce-section">
          <h3>Stats</h3>
          <div className="grid-3">
            <label>Potency
              <input type="number" value={card.potency} onChange={e => setCard({ ...card, potency: Number(e.target.value) })} />
            </label>
            <label>Defense
              <input type="number" value={card.defense} onChange={e => setCard({ ...card, defense: Number(e.target.value) })} />
            </label>
            <label>SP Cost
              <input type="number" value={card.spCost} min={0} onChange={e => setCard({ ...card, spCost: Number(e.target.value) })} />
            </label>
          </div>
          <small className="help">
            Potency adds to the relevant damage type; Defense contributes to effective defense. SP Cost defaults to 0 on the server.
          </small>
        </section>

        <section className="ce-section">
          <h3>Abilities <small>({(card.abilities || []).length}/{MAX_ABILITIES})</small></h3>
          {(card.abilities || []).map((ab, i) => (
            <div key={i} className="ability">
              <div className="ability-head">
                <strong>{ab.key || '(no key)'} — {ab.type}</strong>
                <button type="button" className="danger" onClick={() => removeAbility(i)}>Remove</button>
              </div>

              <div className="grid-3">
                <label>Type
                  <select
                    value={ab.type}
                    onChange={e => {
                      const type = e.target.value;
                      if (type === 'Multi-Hit') {
                        updateAbility(i, { type, power: 0, duration: 0 });
                      } else {
                        updateAbility(i, { type });
                      }
                    }}
                  >
                    {ABILITY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>Ability Key/Name
                  <input
                    placeholder="e.g. mh, Test, Shield1"
                    value={ab.key}
                    onChange={e => renameAbilityKey(i, e.target.value)}
                  />
                  <small className="help">Used by <code>linkedTo</code> and Multi-Hit. Must be unique per card.</small>
                </label>

                {ab.type !== 'Multi-Hit' && (
                  <label>Attack Type
                    <select value={ab.attackType} onChange={e => updateAbility(i, { attackType: e.target.value })}>
                      {ATTACK_TYPES.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </label>
                )}

                {/* Stats Up/Down target (schema-limited) */}
                {(ab.type === 'Stats Up' || ab.type === 'Stats Down') && (
                  <label>Target Stat
                    <select
                      value={ab.target || ''}
                      onChange={e => updateAbility(i, { target: e.target.value })}
                    >
                      <option value="" disabled>Select stat…</option>
                      {STAT_TARGETS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <small className="help">Required for Stats Up/Down. Allowed: {STAT_TARGETS.join(', ')}.</small>
                  </label>
                )}

                {ab.type !== 'Multi-Hit' && (
                  <>
                    <label>Power
                      <input
                        type="number"
                        value={ab.power}
                        onChange={e => updateAbility(i, { power: Number(e.target.value) })}
                      />
                    </label>
                    <label>Duration (turns)
                      <input
                        type="number"
                        value={ab.duration}
                        onChange={e => updateAbility(i, { duration: Number(e.target.value) })}
                      />
                    </label>
                  </>
                )}
                <label>Activation Chance (%)
                  <input type="number" value={ab.activationChance} onChange={e => updateAbility(i, { activationChance: Number(e.target.value) })} />
                </label>

                <label>Precedence
                  <input type="number" value={ab.precedence} onChange={e => updateAbility(i, { precedence: Number(e.target.value) })} />
                  <small className="help">Higher precedence wins when abilities interact.</small>
                </label>

                <label className="full">Description
                  <textarea rows={2} value={ab.desc} onChange={e => updateAbility(i, { desc: e.target.value })} />
                </label>
              </div>

              {ab.type === 'Multi-Hit' && (
                <details className="ability-sub">
                  <summary>Multi-Hit</summary>
                  <div className="grid-3">
                    <label>Turns (0 to disable)
                      <input
                        type="number"
                        value={ab?.multiHit?.turns ?? 0}
                        onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), turns: Number(e.target.value) } })}
                      />
                    </label>
                    {/* NEW: Choose which abilities should repeat with this Multi-Hit */}
                    <fieldset className="full">
                      <legend>Repeat these abilities (adds this MH’s event to their <code>linkedTo</code>)</legend>
                      <div className="row" style={{ gap:12, flexWrap:'wrap' }}>
                        {(card.abilities || []).map((otherAb, j) => {
                          if (j === i) return null; // skip the MH itself
                          const event = (ab?.key || '').trim(); // MH key
                          const isChecked = !!event && Array.isArray(otherAb.linkedTo) && otherAb.linkedTo.includes(event);
                          const label = (otherAb.key?.trim() || otherAb.type || `Ability ${j+1}`);
                          return (
                            <label key={`${i}:${j}`} className="chk">
                              <input
                                type="checkbox"
                                checked={!!isChecked}
                                onChange={e => toggleLinkedUnderMH(i, j, e.target.checked)}
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    <small className="help">
                      This updates each ability’s <code>linkedTo</code> to include the <b>Multi-Hit ability key</b>
                      (<code>{ab?.key || '(no key)'}</code>).
                    </small>
                    </fieldset>
                    <label>Overlap
                      <select
                        value={ab?.multiHit?.overlap || 'inherit'}
                        onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), overlap: e.target.value } })}
                      >
                        <option>inherit</option><option>separate</option>
                      </select>
                    </label>

                    <label>Schedule Type
                      <select
                        value={ab?.multiHit?.schedule?.type || 'random'}
                        onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), schedule: { type: e.target.value, times: 1, turns: [] } } })}
                      >
                        <option>random</option><option>list</option>
                      </select>
                    </label>

                    {ab?.multiHit?.schedule?.type === 'list' ? (
                      <label className="full">Turns list (e.g. 2,4,6)
                        <input
                          placeholder="e.g. 2,4"
                          value={
                            typeof ab._mhCsv === 'string'
                              ? ab._mhCsv
                              : (Array.isArray(ab?.multiHit?.schedule?.turns)
                                  ? ab.multiHit.schedule.turns.join(',')
                                  : '')
                          }
                          onChange={(e) => {
                            const raw = e.target.value; // keep user text (commas)
                            const windowTurns = Math.max(0, Number(ab?.multiHit?.turns) || 0);

                            // Count commas: must be <= (Turns - 1)
                            const commaCount = (raw.match(/,/g) || []).length;
                            const maxCommas  = Math.max(0, windowTurns - 1);

                            // Parse numeric tokens
                            const parsed = parseCSVNums(raw);

                            // Enforce rules:
                            // (1) strictly increasing
                            // (2) each n <= windowTurns
                            // (3) cap total entries to windowTurns
                            const canonical = [];
                            for (const n of parsed) {
                              if (n > windowTurns) continue;                                 // rule #2
                              if (!canonical.length || n > canonical[canonical.length - 1])  // rule #1
                                canonical.push(n);
                              if (canonical.length >= windowTurns) break;
                            }

                            // Derive validation flags for inline hint
                            const tooManyCommas = commaCount > maxCommas;
                            const anyTooLarge   = parsed.some(n => n > windowTurns);
                            const nonIncreasing = parsed.some((n, idx) => idx > 0 && n <= parsed[idx - 1]);

                            // Store raw CSV for UX + parsed canonical list for payload
                            updateAbility(i, {
                              _mhCsv: raw,
                              _mhErr: { tooManyCommas, anyTooLarge, nonIncreasing },
                              multiHit: {
                                ...(ab.multiHit || {}),
                                schedule: { type: 'list', turns: canonical }
                              }
                            });
                          }}
                          onBlur={(e) => {
                            // Normalize the display on blur to the canonical, ordered list
                            const windowTurns = Math.max(0, Number(ab?.multiHit?.turns) || 0);
                            const parsed = parseCSVNums(e.target.value);
                            const canonical = [];
                            for (const n of parsed) {
                              if (n > windowTurns) continue;
                              if (!canonical.length || n > canonical[canonical.length - 1])
                                canonical.push(n);
                              if (canonical.length >= windowTurns) break;
                            }
                            updateAbility(i, {
                              _mhCsv: canonical.join(','), // normalized CSV view
                              _mhErr: null,
                              multiHit: {
                                ...(ab.multiHit || {}),
                                schedule: { type: 'list', turns: canonical }
                              }
                            });
                          }}
                        />

                        {Number(ab?.multiHit?.turns) > 0 && (
                          <small className="help" style={{
                            color: (ab?._mhErr?.tooManyCommas || ab?._mhErr?.anyTooLarge || ab?._mhErr?.nonIncreasing) ? '#f59e0b' : '#9ca3af'
                          }}>
                            Rules: <b>strictly increasing</b>; each ≤ <b>Turns</b>; max commas: <b>{Math.max(0, (Number(ab?.multiHit?.turns)||0) - 1)}</b>.
                            {ab?._mhErr?.nonIncreasing && ' (Fix order: each value must be greater than the previous)'}
                            {ab?._mhErr?.anyTooLarge && ' (Remove values greater than Turns)'}
                            {ab?._mhErr?.tooManyCommas && ' (Too many commas for this Turns)'}
                          </small>
                        )}
                        {!!(Number(ab?.multiHit?.turns) || 0) && (
                          <small className="help" style={{ color:
                            ((typeof ab._mhCsv === 'string' ? (ab._mhCsv.match(/,/g) || []).length : 0) >
                              Math.max(0, (Number(ab?.multiHit?.turns) || 0) - 1))
                              ? '#f59e0b' : '#9ca3af'
                          }}>
                            Max commas: {(Math.max(0, (Number(ab?.multiHit?.turns) || 0) - 1))} (based on <b>Turns</b>).
                            Extra commas are ignored when saving.
                          </small>
                        )}
                      </label>
                    ) : (
                      <label>Random Times
                        <input
                          type="number"
                          min={1}
                          value={ab?.multiHit?.schedule?.times ?? 1}
                          onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), schedule: { type: 'random', times: Number(e.target.value) } } })}
                        />
                      </label>
                    )}

                    <label>Targeting Mode
                      <select
                        value={ab?.multiHit?.targeting?.mode || 'lock'}
                        onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), targeting: { ...(ab.multiHit?.targeting || {}), mode: e.target.value } } })}
                      >
                        {TARGETING_MODES.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </label>
                    <label>Targeting Scope
                      <select
                        value={ab?.multiHit?.targeting?.scope || 'character'}
                        onChange={e => updateAbility(i, { multiHit: { ...(ab.multiHit || {}), targeting: { ...(ab.multiHit?.targeting || {}), scope: e.target.value } } })}
                      >
                        {TARGETING_SCOPES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                  </div>
                  <small className="help">Multi-Hit only applies when <b>Turns ≥ 1</b>. If 0, it’s removed by the server’s sanitization.</small>
                </details>
              )}

              <details className="ability-sub">
                <summary>Durability Negation (DN)</summary>
                <div className="grid-3">
                  <label>Auto
                    <input
                      type="checkbox"
                      checked={ab?.durabilityNegation?.auto !== false}
                      onChange={e => updateAbility(i, { durabilityNegation: { ...(ab.durabilityNegation || {}), auto: e.target.checked } })}
                    />
                  </label>
                  <label>DN Schedule Type
                    <select
                      value={ab?.durabilityNegation?.schedule?.type || 'random'}
                      onChange={e => updateAbility(i, { durabilityNegation: { ...(ab.durabilityNegation || {}), schedule: { type: e.target.value, times: 1, turns: [] } } })}
                    >
                      <option>random</option><option>list</option>
                    </select>
                  </label>
                  {ab?.durabilityNegation?.schedule?.type === 'list' ? (
                    <label className="full">Turns list (e.g. 1,3)
                      <input
                        placeholder="e.g. 1,3"
                        value={Array.isArray(ab?.durabilityNegation?.schedule?.turns) ? ab.durabilityNegation.schedule.turns.join(',') : ''}
                        onChange={e => updateAbility(i, {
                          durabilityNegation: {
                            ...(ab.durabilityNegation || {}),
                            schedule: { type: 'list', turns: parseCSVNums(e.target.value) }
                          }
                        })}
                      />
                    </label>
                  ) : (
                    <label>Random Times
                      <input
                        type="number"
                        min={1}
                        value={ab?.durabilityNegation?.schedule?.times ?? 1}
                        onChange={e => updateAbility(i, { durabilityNegation: { ...(ab.durabilityNegation || {}), schedule: { type: 'random', times: Number(e.target.value) } } })}
                      />
                    </label>
                  )}
                </div>
              </details>
            </div>
          ))}
          {countActiveMultiHit() > 1 && (
            <div className="validation-warn" style={{ color:'#f59e0b', marginBottom:8 }}>
              Only <b>one</b> primary <b>Multi-Hit</b> (Turns ≥ 1) is allowed by the schema. Please disable extras.
            </div>
          )}
          <button type="button" onClick={addAbility} disabled={(card.abilities || []).length >= MAX_ABILITIES}>+ Add Ability</button>

          <div className="ability-help">
            <p><b>What do these fields do?</b></p>
            <ul>
              <li><b>Type</b>: which effect this ability is (de/buffs, negations, Multi-Hit, etc.).</li>
              <li><b>Attack Type</b>: Single or AoE target shape for this ability.</li>
              <li><b>Power</b>/<b>Duration</b>/<b>Activation</b>: numbers that drive your effect strength, how long it lasts, and how likely it fires.</li>
              <li><b>Precedence</b>: higher precedence wins when abilities interact (e.g. Negation vs Shield).</li>
              <li><b>linkedTo</b>: connect abilities to each other or to the base <code>attack</code>.</li>
              <li><b>Multi-Hit</b>: schedule repeated hits; optional targeting rules per hit.</li>
              <li><b>DN</b>: control Durability-Negation timing.</li>
            </ul>
          </div>
        </section>

        {msg && <div className="ce-msg">{msg}</div>}
      </form>

      <aside className="ce-list">
        <div className="list-head">
          <h3>Cards</h3>
          {/* FIX: actually call loadCards */}
          <button className="ghost" onClick={loadCards}>↻ Refresh</button>
        </div>
        <ul>
          {cards.map(c => (
            <li key={c._id} className={card._id === c._id ? 'active' : ''}>
              <button className="row" onClick={() => loadIntoForm(c)}>
                <span className="name">{c.name}</span>
                <span className="meta">[{Array.isArray(c.type) ? c.type.join(', ') : (Array.isArray(c.types) ? c.types.join(', ') : c.type)}] ({c.rating})</span>
              </button>
              <div className="row right">
                <button
                  className="danger"
                  onClick={() => removeCard(c._id)}
                  disabled={!token}
                  title={!token ? 'Please log in' : ''}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
