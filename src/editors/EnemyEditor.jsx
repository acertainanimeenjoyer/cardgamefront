// pages/EnemyEditor.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { getCards, getEnemies, createEnemy, updateEnemy, deleteEnemy } from '../api/editorApi';
import '../styles/EnemyEditor.css';

const DEFAULT_STATS = {
  attackPower: 10, supernaturalPower: 10, physicalPower: 10,
  durability: 10, vitality: 1, intelligence: 1, speed: 5,
  sp: 3, maxSp: 5, defense: 10,
};

const DEFAULT_AI = {
  cardPriority: [], // [{ cardId, priority }]
  combos: [],       // [{ cards: [ids], priority }]
  spSkipThreshold: 0.3,
  defendHpThreshold: 0.5,
  skipForComboThreshold: 1.25,
  weights: { play: 1, skip: 1, defend: 1 },
  greedChance: 0.15,
};

const emptyEnemy = () => ({
  _id: null,
  name: '',
  imageUrl: '',
  description: '',
  stats: { ...DEFAULT_STATS },
  moveSet: [],
  aiConfig: { ...DEFAULT_AI },
});

export default function EnemyEditor() {
  const { token } = useContext(AuthContext);
  const [cards, setCards] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [enemy, setEnemy] = useState(emptyEnemy());
  const [msg, setMsg] = useState('');
  const [cardQuery, setCardQuery] = useState('');

  // --- PNG/JPEG helper (accept both; PNG keeps alpha, JPEG compressed) ---
  const downscaleToImage = (file, { maxW = 512, maxH = 512, maxKB = 160, quality = 0.9 } = {}) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        return reject(new Error('Please select a PNG or JPEG (.png/.jpg)'));
      }
      const isPNG = file.type === 'image/png';
      const mime = isPNG ? 'image/png' : 'image/jpeg';
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => { img.src = fr.result; };
      fr.onerror = () => reject(new Error('Failed to read image'));
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const estimateKB = (du) => Math.round(((du.length * 3) / 4) / 1024);
        let dataUrl;
        if (isPNG) {
          dataUrl = canvas.toDataURL('image/png');
          // no quality knob; reduce dimensions if needed
          let tryW = w, tryH = h, tries = 4;
          while (estimateKB(dataUrl) > maxKB && tries-- > 0) {
            tryW = Math.max(1, Math.round(tryW * 0.85));
            tryH = Math.max(1, Math.round(tryH * 0.85));
            canvas.width = tryW; canvas.height = tryH;
            ctx.drawImage(img, 0, 0, tryW, tryH);
            dataUrl = canvas.toDataURL('image/png');
          }
        } else {
          // JPEG: binary search quality
          let lo = 0.5, hi = quality, best = canvas.toDataURL('image/jpeg', lo);
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            const du = canvas.toDataURL('image/jpeg', mid);
            if (estimateKB(du) <= maxKB) { best = du; lo = mid; } else { hi = mid; }
          }
          dataUrl = best;
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Invalid image'));
      fr.readAsDataURL(file);
    });

  const hpPreview = useMemo(() => {
    const v = Number(enemy.stats.vitality || 0);
    return Math.max(1, v) * 100;
  }, [enemy.stats.vitality]);

  // initial load
  useEffect(() => {
    (async () => {
      if (!token) { setCards([]); setEnemies([]); return; }
      try {
        const [allCards, allEnemies] = await Promise.all([ getCards(token), getEnemies(token) ]);
        setCards(Array.isArray(allCards) ? allCards : []);
        setEnemies(Array.isArray(allEnemies) ? allEnemies : []);
      } catch (e) {
        setMsg('Error loading data: ' + (e?.message || 'failed'));
      }
    })();
  }, [token]);

  const reset = () => setEnemy(emptyEnemy());

  const loadEnemy = (doc) => {
    const deck = doc.deck || doc.moveSet || [];
    const ids = deck.map(c => (c._id || c));
    setEnemy({
      _id: doc._id,
      name: doc.name || '',
      imageUrl: doc.imageUrl || '',
      description: doc.description || '',
      stats: { ...DEFAULT_STATS, ...(doc.stats || {}) },
      moveSet: ids,
      aiConfig: {
        ...DEFAULT_AI,
        ...(doc.aiConfig || {}),
        weights: { ...DEFAULT_AI.weights, ...(doc.aiConfig?.weights || {}) }
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    setMsg('');
    if (!token) { setMsg('Please log in to save.'); return; }

    // sanitize stats to numbers with sensible defaults
    const stats = Object.fromEntries(
      Object.keys(DEFAULT_STATS).map(k => {
        const n = Number(enemy.stats?.[k]);
        return [k, Number.isFinite(n) ? n : DEFAULT_STATS[k]];
      })
    );

    // normalize AI config with defaults
    const ai = {
      ...DEFAULT_AI,
      ...(enemy.aiConfig || {}),
      weights: {
        ...DEFAULT_AI.weights,
        ...(enemy.aiConfig?.weights || {}),
      },
      spSkipThreshold: Number.isFinite(enemy.aiConfig?.spSkipThreshold)
        ? enemy.aiConfig.spSkipThreshold : DEFAULT_AI.spSkipThreshold,
      defendHpThreshold: Number.isFinite(enemy.aiConfig?.defendHpThreshold)
        ? enemy.aiConfig.defendHpThreshold : DEFAULT_AI.defendHpThreshold,
      skipForComboThreshold: Number.isFinite(enemy.aiConfig?.skipForComboThreshold)
        ? enemy.aiConfig.skipForComboThreshold : DEFAULT_AI.skipForComboThreshold,
      greedChance: Number.isFinite(enemy.aiConfig?.greedChance)
        ? enemy.aiConfig.greedChance : DEFAULT_AI.greedChance,
    };

    // build enemy payload
    const payload = {
      name: String(enemy.name || '').trim(),
      imageUrl: enemy.imageUrl || '',
      description: enemy.description || '',
      stats,
      moveSet: (enemy.moveSet || []).filter(Boolean),
      aiConfig: ai,
    };

    try {
      const saved = enemy._id
        ? await updateEnemy(enemy._id, payload, token)
        : await createEnemy(payload, token);

      const allEnemies = await getEnemies(token);
      setEnemies(Array.isArray(allEnemies) ? allEnemies : []);
      if (!enemy._id) setEnemy(prev => ({ ...prev, _id: saved?._id || prev._id }));
      setMsg('Saved!');
    } catch (err) {
      setMsg(err?.message || 'Save failed');
    }
  };


  const onDelete = async (id) => {
  if (!token) { setMsg('Please log in to delete.'); return; }
  if (!id || !confirm('Delete this enemy?')) return;
    try {
      await deleteEnemy(id, token);
      const allEnemies = await getEnemies(token);
      setEnemies(Array.isArray(allEnemies) ? allEnemies : []);
      if (enemy._id === id) reset();
    } catch (e) {
      setMsg('Delete failed: ' + (e?.message || 'unknown error'));
    }
  };

  const addMove = (id) => {
    if (!id) return;
    setEnemy(e => ({ ...e, moveSet: [...(e.moveSet || []), String(id)] }));
  };
  const removeMoveAt = (i) => {
    setEnemy(e => {
      const ms = (e.moveSet || []).slice();
      if (i < 0 || i >= ms.length) return e;
      ms.splice(i, 1);
      return { ...e, moveSet: ms };
    });
  };
  const moveUp = (i) => {
    if (i <= 0) return;
    const ms = enemy.moveSet.slice();
    [ms[i-1], ms[i]] = [ms[i], ms[i-1]];
    setEnemy({ ...enemy, moveSet: ms });
  };
  const moveDown = (i) => {
    const ms = enemy.moveSet.slice();
    if (i >= ms.length-1) return;
    [ms[i+1], ms[i]] = [ms[i], ms[i+1]];
    setEnemy({ ...enemy, moveSet: ms });
  };

  const filteredCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return q ? cards.filter(c => (c.name || '').toLowerCase().includes(q)) : cards;
  }, [cards, cardQuery]);

  const setStat = (k, v) => setEnemy({ ...enemy, stats: { ...enemy.stats, [k]: Number(v) } });

  const addPriority = () => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, cardPriority: [...(enemy.aiConfig.cardPriority||[]), { cardId: '', priority: 1 }] } });
  const setPriority = (i, patch) => {
    const rows = (enemy.aiConfig.cardPriority || []).slice();
    rows[i] = { ...rows[i], ...patch };
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, cardPriority: rows } });
  };
  const removePriority = (i) => {
    const rows = (enemy.aiConfig.cardPriority || []).filter((_, idx) => idx !== i);
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, cardPriority: rows } });
  };

  const addCombo = () => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, combos: [...(enemy.aiConfig.combos||[]), { cards: [], priority: 1 }] } });
  const setCombo = (i, patch) => {
    const rows = (enemy.aiConfig.combos || []).slice();
    rows[i] = { ...rows[i], ...patch };
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, combos: rows } });
  };
  const removeCombo = (i) => {
    const rows = (enemy.aiConfig.combos || []).filter((_, idx) => idx !== i);
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, combos: rows } });
  };

  const addCardToCombo = (ci, id) => {
    const row = (enemy.aiConfig.combos || [])[ci];
    if (!row || !id) return;
    const rows = (enemy.aiConfig.combos || []).slice();
    rows[ci] = { ...row, cards: [...row.cards, id] }; // allow duplicates
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, combos: rows } });
  };

  const removeCardFromComboAt = (ci, idx) => {
    const rows = (enemy.aiConfig.combos || []).slice();
    const next = rows[ci]?.cards?.slice() || [];
    if (idx < 0 || idx >= next.length) return;
    next.splice(idx, 1); // remove only this one copy
    rows[ci] = { ...rows[ci], cards: next };
    setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, combos: rows } });
  };

  const nameOf = (id) => cards.find(c => String(c._id) === String(id))?.name || id;

  // helper to render type meta robustly (handles c.type or c.types)
  const typeLabel = (c) => {
    const arr = Array.isArray(c?.type) ? c.type : (Array.isArray(c?.types) ? c.types : [c?.type].filter(Boolean));
    return arr.join(', ');
  };

  return (
    <div className="ee-wrap">
      <form className="ee-form" onSubmit={onSave}>
        <header className="ee-header">
          <h2>Enemy Editor</h2>
          <div className="ee-actions">
            <button className="primary" type="submit" disabled={!token} title={!token ? 'Please log in' : ''}>
              {enemy._id ? 'Update Enemy' : 'Create Enemy'}
            </button>
            <button type="button" className="ghost" onClick={reset}>New</button> {/* safe w/o token */}
          </div>
        </header>

        <div className="row" style={{ gap:8, marginBottom:12 }}>
          <button type="button" className="ghost" disabled={!token} title={!token ? 'Please log in' : ''} onClick={async ()=>{
            if (!token) return;
            try {
              const [allCards, allEnemies] = await Promise.all([ getCards(token), getEnemies(token) ]);
              setCards(Array.isArray(allCards) ? allCards : []);
              setEnemies(Array.isArray(allEnemies) ? allEnemies : []);
            } catch (e) {
              setMsg('Refresh failed: ' + (e?.message || 'unknown error'));
            }
          }}>↻ Refresh</button>
        </div>
        
        <section className="ee-section">
          <h3>Core</h3>
          <div className="grid-2">
            <label>Name<input value={enemy.name} onChange={e => setEnemy({ ...enemy, name: e.target.value })} required/></label>
            <label>Image URL (optional)<input value={enemy.imageUrl} onChange={e => setEnemy({ ...enemy, imageUrl: e.target.value })}/></label>

            <label className="full">Or upload PNG/JPEG
              <div className="row" style={{ gap:8, alignItems:'center' }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await downscaleToImage(file);
                      setEnemy({ ...enemy, imageUrl: dataUrl });
                    } catch (err) {
                      setMsg(err?.message || 'Image upload failed');
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
                {enemy.imageUrl && (
                  <button type="button" className="danger" onClick={()=>setEnemy({ ...enemy, imageUrl: '' })}>Clear</button>
                )}
              </div>

              {enemy.imageUrl && (
                <div className="img-preview" style={{ marginTop:8 }}>
                  <img src={enemy.imageUrl} alt="enemy" style={{ maxWidth: '100%', border:'1px solid #333', borderRadius:8 }} />
                </div>
              )}
              <small className="help">Uploads are resized (≈ ≤160KB, ≤512×512). URLs work too.</small>
            </label>

            <label className="full">Description<textarea rows={3} value={enemy.description} onChange={e => setEnemy({ ...enemy, description: e.target.value })}/></label>
          </div>
        </section>

        <section className="ee-section">
          <h3>Stats <small>(HP preview: {enemy.stats.hp ?? hpPreview})</small></h3>
          <div className="grid-3">
            {Object.keys(DEFAULT_STATS).map(k => (
              <label key={k}>{k}<input type="number" value={enemy.stats[k]} onChange={e => setStat(k, e.target.value)} /></label>
            ))}
          </div>
          <small className="help">HP is derived from Vitality × 100 when not explicitly present in runtime stats; the API may compute this in responses.</small>
        </section>

        <section className="ee-section">
          <h3>Move Set</h3>
          <div className="grid-2">
            <div>
              <label>Search available cards
                <input placeholder="type to filter…" value={cardQuery} onChange={e => setCardQuery(e.target.value)} />
              </label>
              <div className="ee-cardlist">
                {filteredCards.map(c => (
                  <button type="button" key={c._id} onClick={() => addMove(c._id)} className="list-item">
                    <span>{c.name}</span><span className="meta">[{typeLabel(c)}]</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="ee-picked">
                {enemy.moveSet.map((id, i) => (
                  <div className="picked-row" key={`${id}-${i}`}>
                    <span className="name">{i + 1}. {nameOf(id)}</span>
                    <div className="rowbtns">
                      <button type="button" onClick={() => moveUp(i)}>↑</button>
                      <button type="button" onClick={() => moveDown(i)}>↓</button>
                      <button type="button" className="danger" onClick={() => removeMoveAt(i)}>✕</button>
                    </div>
                  </div>
                ))}
                {!enemy.moveSet.length && <div className="img-placeholder">no cards selected</div>}
              </div>
              <small className="help">Saves as <code>moveSet</code> (array of Card IDs). The API can also return a populated <code>deck</code> alias for UI use.</small>
            </div>
          </div>
        </section>

        <section className="ee-section">
          <h3>AI Config</h3>
          <div className="grid-3">
            <label>spSkipThreshold<input type="number" step="0.01" value={enemy.aiConfig.spSkipThreshold} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, spSkipThreshold: Number(e.target.value) } })}/></label>
            <label>defendHpThreshold<input type="number" step="0.01" value={enemy.aiConfig.defendHpThreshold} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, defendHpThreshold: Number(e.target.value) } })}/></label>
            <label>skipForComboThreshold<input type="number" step="0.01" value={enemy.aiConfig.skipForComboThreshold} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, skipForComboThreshold: Number(e.target.value) } })}/></label>
            <label>weights.play<input type="number" value={enemy.aiConfig.weights.play} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, weights: { ...enemy.aiConfig.weights, play: Number(e.target.value) } } })}/></label>
            <label>weights.skip<input type="number" value={enemy.aiConfig.weights.skip} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, weights: { ...enemy.aiConfig.weights, skip: Number(e.target.value) } } })}/></label>
            <label>weights.defend<input type="number" value={enemy.aiConfig.weights.defend} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, weights: { ...enemy.aiConfig.weights, defend: Number(e.target.value) } } })}/></label>
            <label>greedChance<input type="number" step="0.01" value={enemy.aiConfig.greedChance} onChange={e => setEnemy({ ...enemy, aiConfig: { ...enemy.aiConfig, greedChance: Number(e.target.value) } })}/></label>
          </div>

          <div className="ee-subsection">
            <div className="rowhead">
              <h4>Card Priority</h4>
              <button type="button" onClick={addPriority}>+ Add row</button>
            </div>
            {(enemy.aiConfig.cardPriority || []).map((row, i) => (
              <div key={i} className="prio-row">
                <select value={row.cardId || ''} onChange={e => setPriority(i, { cardId: e.target.value })}>
                  <option value="">-- choose card --</option>
                  {cards.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
                <input type="number" value={row.priority ?? 1} onChange={e => setPriority(i, { priority: Number(e.target.value) })}/>
                <button type="button" className="danger" onClick={() => removePriority(i)}>✕</button>
              </div>
            ))}
            {!enemy.aiConfig.cardPriority?.length && <div className="img-placeholder">no priority rules</div>}
          </div>

          <div className="ee-subsection">
            <div className="rowhead">
              <h4>Combos</h4>
              <button type="button" onClick={addCombo}>+ Add combo</button>
            </div>
            {(enemy.aiConfig.combos || []).map((row, i) => (
              <div key={i} className="combo-row">
                <div className="combo-cards">
                  {row.cards.map((id, j) => (
                    <span className="tag" key={`${id}-${j}`}>
                      {nameOf(id)} <button type="button" onClick={() => removeCardFromComboAt(i, j)}>×</button>
                    </span>
                  ))}
                  <select onChange={e => { addCardToCombo(i, e.target.value); e.target.value=''; }}>
                    <option value="">+ Add card</option>
                    {cards.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                <label>Priority <input type="number" value={row.priority ?? 1} onChange={e => setCombo(i, { priority: Number(e.target.value) })}/></label>
                <button type="button" className="danger" onClick={() => removeCombo(i)}>Remove</button>
              </div>
            ))}
            {!enemy.aiConfig.combos?.length && <div className="img-placeholder">no combos</div>}
          </div>
        </section>

        {msg && <div className="ee-msg">{msg}</div>}
      </form>

      <aside className="ee-list">
        <div className="list-head">
          <h3>Enemies</h3>
        <button className="ghost" disabled={!token} title={!token ? 'Please log in' : ''} onClick={async () => {
          if (!token) return;
          try { setEnemies(await getEnemies(token) || []); }
          catch (e) { setMsg('Refresh failed: ' + (e?.message || 'unknown error')); }
        }}>↻ Refresh</button>
        </div>
        <ul>
          {enemies.map(e => (
            <li key={e._id} className={enemy._id === e._id ? 'active' : ''}>
              <button className="row" onClick={() => loadEnemy(e)}>
                <span className="name">{e.name}</span>
                <span className="meta">moves: {(e.deck || e.moveSet || []).length}</span>
              </button>
              <div className="row right">
                <button className="danger" disabled={!token} title={!token ? 'Please log in' : ''} onClick={() => onDelete(e._id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
