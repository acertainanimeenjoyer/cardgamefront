// src/editors/CampaignEditor.jsx
import React, { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import campaignApi from '../services/campaignService';
import { listRooms } from '../api/roomApi';
import RoomEditor from './RoomEditor';
import '../styles/GamePage.css';

const DEFAULT_CAMPAIGN = () => ({
  _id: null,
  name: '',
  cover: null,
  length: 10,
  generator: {
    useWeighted: true,
    roomWeights: [
      { type: 'combat', weight: 4 },
      { type: 'loot', weight: 2 },
      { type: 'merchant', weight: 1 },
      { type: 'event', weight: 2 },
    ],
    insertRestBefore: 'boss', // 'combat' | 'boss' | 'none'
    randomLoot: { items: [], maxPicks: 1 },
  },
  roomSequence: [],
  playerSetup: {
    startingDeck: [],
    startingHandSize: 3,
    minDeckSize: 30,
    maxDeckSize: 30,
    // Optional campaign baseline; leave blank to use server defaults.
    // hp is optional; if blank, server derives from vitality.
    initialStats: {
      attackPower:       undefined,
      physicalPower:     undefined,
      supernaturalPower: undefined,
      durability:        undefined,
      vitality:          undefined,
      intelligence:      undefined,
      speed:             undefined,
      sp:                undefined,
      maxSp:             undefined,
      hp:                undefined
    }
  },
  _mode: 'generator', // 'generator' | 'sequence' (UI only)
});

// convert server entries -> array of ids for the selects (expands qty)
const idsFromEntries = (entries) => {
  const out = [];
  for (const e of (entries || [])) {
    if (!e || !e.cardId) continue;
    const n = Math.max(1, Math.min(30, Number(e.qty || 1)));
    for (let i = 0; i < n; i++) out.push(String(e.cardId));
  }
  return out;
};

// convert UI ids -> compact entries for server (groups duplicates)
const entriesFromIds = (ids) => {
  const counts = new Map();
  for (const id of (ids || [])) {
    if (!id) continue;
    const k = String(id);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].map(([cardId, qty]) => ({ cardId, qty }));
};

function LootItemRow({ value, onChange, onRemove, cards }) {
  const kind = value.kind || 'money';
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <select value={kind} onChange={(e) => onChange({ ...value, kind: e.target.value })}>
        <option value="money">money</option>
        <option value="statBuff">statBuff</option>
        <option value="card">card</option>
      </select>

      {kind === 'money' && (
        <>
          <span>Amount</span>
          <input
            type="number"
            value={value.amount ?? 0}
            onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
          />
        </>
      )}

      {kind === 'statBuff' && (
        <>
          <select
            value={value.stat || 'attackPower'}
            onChange={(e) => onChange({ ...value, stat: e.target.value })}
          >
            {[
              'attackPower',
              'physicalPower',
              'supernaturalPower',
              'durability',
              'vitality',
              'intelligence',
              'speed',
              'defense',
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span>+ </span>
          <input
            type="number"
            value={value.amount ?? 0}
            onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
          />
        </>
      )}

      {kind === 'card' && (
        <>
          <span>Card</span>
          <select
            value={value.cardId || ''}
            onChange={(e) => onChange({ ...value, cardId: e.target.value })}
          >
            <option value="">-- choose card --</option>
            {cards.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      <button type="button" className="danger" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function WeightsEditor({ weights, onChange }) {
  const types = ['combat', 'loot', 'merchant', 'event', 'rest'];
  const setW = (i, patch) => {
    const arr = weights.slice();
    arr[i] = { ...arr[i], ...patch };
    onChange(arr);
  };
  const addW = () => onChange([...weights, { type: 'combat', weight: 1 }]);
  const rmW = (i) => onChange(weights.filter((_, idx) => idx !== i));
  return (
    <div className="list" style={{ display: 'grid', gap: 8 }}>
      {weights.map((w, i) => (
        <div key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
          <select value={w.type} onChange={(e) => setW(i, { type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span>weight</span>
          <input
            type="number"
            value={w.weight ?? 1}
            onChange={(e) => setW(i, { weight: Number(e.target.value) })}
          />
          <button type="button" className="danger" onClick={() => rmW(i)}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={addW}>
        + Add weight
      </button>
    </div>
  );
}

function PreviewList({ path = [] }) {
  const icon = (t) =>
    t === 'boss' ? '👹' : t === 'combat' ? '⚔️' : t === 'loot' ? '🎁' : t === 'merchant' ? '🛒' : t === 'event' ? '🎭' : t === 'rest' ? '🛏️' : '•';
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 6 }}>
      {path.map((r, i) => (
        <li key={i} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px' }}>
          <span>
            {i + 1}. {icon(r.type)} {r.type}
          </span>
          <small className="meta" style={{ color: '#9ca3af' }}>
            {r.name || ''}
          </small>
        </li>
      ))}
      {!path.length && <li className="list-item">— no preview —</li>}
    </ul>
  );
}

export default function CampaignEditor() {
  const { token } = useContext(AuthContext);
  const [tab, setTab] = useState('campaigns'); // 'rooms' | 'campaigns'
  const [campaigns, setCampaigns] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [cards, setCards] = useState([]);
  const [campaign, setCampaign] = useState(DEFAULT_CAMPAIGN());
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState([]);
  
  // load lists; browse 'all' when logged out to avoid 401s
  useEffect(() => {
    (async () => {
      const scope = token ? 'mine' : 'all';
      try {
        const [cs, rs] = await Promise.all([
          campaignApi.listCampaigns(token, scope),
          listRooms(token, scope),
        ]);
        setCampaigns(Array.isArray(cs) ? cs : []);
        setRooms(Array.isArray(rs) ? rs : []);
      } catch {
        setCampaigns([]);
        setRooms([]);
        if (!token) {
          setMsg('Log in to view your campaigns/rooms (public “all” scope may be limited).');
        }
      }
    })();
  }, [token]);

  const filteredCampaigns = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? campaigns.filter((c) => (c.name || '').toLowerCase().includes(q)) : campaigns;
  }, [campaigns, filter]);

  const loadCampaign = async (id) => {
    try {
      const doc = await campaignApi.getCampaign(id, token);
      setCampaign({
        ...DEFAULT_CAMPAIGN(),
        ...doc,
        _mode: Array.isArray(doc.roomSequence) && doc.roomSequence.length ? 'sequence' : 'generator',
        playerSetup: {
          ...(doc.playerSetup || {}),
          // IMPORTANT: UI wants array of IDs (expanded by qty)
          startingDeck: idsFromEntries(doc.playerSetup?.startingDeck),
          initialStats: { ...(doc.playerSetup?.initialStats || {}) }
        }
      });
      setPreview([]);
      setMsg('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setMsg('Failed to load campaign');
    }
  };

  const reset = () => {
    setCampaign(DEFAULT_CAMPAIGN());
    setPreview([]);
    setMsg('');
  };

  const setGen = (patch) => setCampaign({ ...campaign, generator: { ...(campaign.generator || {}), ...patch } });

  // lazy-load cards only when needed; browse "all" when logged out
  const ensureCardsLoaded = async () => {
    if (!cards.length) {
      const mod = await import('../api/editorApi');
      const fetched = await mod.getCards(token, token ? 'mine' : 'all');
      setCards(Array.isArray(fetched) ? fetched : []);
    }
  };

  const addRandomLoot = async () => {
    await ensureCardsLoaded();
    const rl = campaign.generator.randomLoot || { items: [], maxPicks: 1 };
    setGen({ randomLoot: { ...rl, items: [...(rl.items || []), { kind: 'money', amount: 10 }] } });
  };
  const changeRandomLoot = (i, patch) => {
    const rl = campaign.generator.randomLoot || { items: [], maxPicks: 1 };
    const arr = rl.items.slice();
    arr[i] = patch;
    setGen({ randomLoot: { ...rl, items: arr } });
  };
  const removeRandomLoot = (i) => {
    const rl = campaign.generator.randomLoot || { items: [], maxPicks: 1 };
    const arr = rl.items.slice();
    arr.splice(i, 1);
    setGen({ randomLoot: { ...rl, items: arr } });
  };

  // Sequence editing
  const addRoomToSeq = (id) => setCampaign({ ...campaign, roomSequence: [...(campaign.roomSequence || []), id] });
  const removeRoomFromSeq = (i) => {
    const arr = (campaign.roomSequence || []).slice();
    arr.splice(i, 1);
    setCampaign({ ...campaign, roomSequence: arr });
  };
  const moveSeq = (i, dir) => {
    const arr = (campaign.roomSequence || []).slice();
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setCampaign({ ...campaign, roomSequence: arr });
  };
  const nameOfRoom = (id) => rooms.find((r) => String(r._id) === String(id))?.name || id;

  const generatePreview = async () => {
    try {
      if (!token) { setMsg('Please log in to generate a preview.'); return; }
      setPreview([]);
      const id = campaign._id;
      if (!id) {
        setMsg('Save the campaign first to preview');
        return;
      }
      // Backend: { sequence, generated } or plain array — unwrap safely
      const resp = await campaignApi.getCampaignSequence(id, token);
      const raw = Array.isArray(resp) ? resp : resp?.sequence || [];
      const seq = raw.map((item) => {
        if (typeof item === 'string') {
          const r = rooms.find((rr) => String(rr._id) === String(item));
          return r ? { type: r.type, name: r.name } : { type: 'unknown', name: item };
        }
        return item;
      });
      setPreview(seq);
    } catch {
      setMsg('Failed to preview');
    }
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    setMsg('');
    if (!token) { setMsg('Please log in to save.'); return; }
    try {
      // Normalize startingDeck -> [{ cardId, qty }]
      const sd = entriesFromIds(campaign.playerSetup?.startingDeck || []);
      // Ensure cover has sizeKB if it’s a data:URI (TinyImage)
      if (!sd.length) {
        setMsg('Starting deck is empty — add at least 1 card.');
        return;
      }
      const cover =
        campaign.cover && campaign.cover.data
          ? (() => {
              const du = campaign.cover.data;
              let sizeKB = campaign.cover.sizeKB;
              if (!sizeKB && typeof du === 'string' && du.startsWith('data:')) {
                const b64 = du.split(',')[1] || '';
                const bytes = Math.floor((b64.length * 3) / 4);
                sizeKB = Math.round(bytes / 1024);
              }
              return { ...campaign.cover, sizeKB: sizeKB || 90 };
            })()
          : campaign.cover;

      const body = {
        ...campaign,
        cover,
        playerSetup: {
          ...(campaign.playerSetup || {}),
          startingDeck: sd,
        },
      };
      delete body._mode;

      const saved = campaign._id
        ? await campaignApi.updateCampaign(campaign._id, body, token)
        : await campaignApi.createCampaign(body, token);

      const cs = await campaignApi.listCampaigns(token, 'mine');
      setCampaigns(cs || []);
      if (!campaign._id) setCampaign({ ...campaign, _id: saved?._id });
      setMsg('Saved!');
    } catch (err) {
      setMsg(err?.message || 'Save failed');
    }
  };

  const downscaleToImage = (file, { maxW = 1920, maxH = 1080, maxKB = 90, quality = 0.9 } = {}) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        return reject(new Error('Please choose a PNG or JPEG (.png/.jpg)'));
      }
      const isPNG = file.type === 'image/png';
      const mime = isPNG ? 'image/png' : 'image/jpeg';
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error('Failed to read image'));
      img.onload = () => {
        const baseRatio = Math.min(maxW / img.width, maxH / img.height, 1);
        let ratio = baseRatio;
        let dataUrl;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const estimateKB = (du) => Math.round(((du.length * 3) / 4) / 1024);
        const renderAt = (r, q = quality) => {
          const w = Math.max(1, Math.round(img.width * r));
          const h = Math.max(1, Math.round(img.height * r));
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          if (isPNG) return canvas.toDataURL('image/png'); // dimension-only shrink for PNG
          // JPEG: binary search quality to hit KB target
          let lo = 0.5, hi = q, best = canvas.toDataURL('image/jpeg', lo);
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            const du = canvas.toDataURL('image/jpeg', mid);
            if (estimateKB(du) <= maxKB) { best = du; lo = mid; } else { hi = mid; }
          }
          return best;
        };
        dataUrl = renderAt(ratio);
        if (estimateKB(dataUrl) > maxKB && isPNG) {
          for (let i = 0; i < 4 && estimateKB(dataUrl) > maxKB; i++) {
            ratio *= 0.85;
            dataUrl = renderAt(ratio);
          }
        }
        resolve({ dataUrl, mime, sizeKB: estimateKB(dataUrl) });
      };
      img.onerror = () => reject(new Error('Invalid image'));
      fr.readAsDataURL(file);
    });

  const onDelete = async () => {
    if (!token) { setMsg('Please log in to delete.'); return; }
    if (!campaign._id) return;
    if (!confirm('Delete this campaign?')) return;
    try {
      await campaignApi.deleteCampaign(campaign._id, token);
      const cs = await campaignApi.listCampaigns(token, 'mine');
      setCampaigns(Array.isArray(cs) ? cs : []);
      reset();
    } catch (e) {
      setMsg('Delete failed: ' + (e?.message || 'unknown error'));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, padding: 24 }}>
      <div className="ee-form" style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 10, padding: 20, color: '#e5e7eb' }}>
        <header className="ee-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="tabs" style={{ display: 'flex', gap: 8 }}>
            <button className={tab === 'campaigns' ? 'primary' : 'ghost'} type="button" onClick={() => setTab('campaigns')}>
              Campaigns
            </button>
            <button className={tab === 'rooms' ? 'primary' : 'ghost'} type="button" onClick={() => setTab('rooms')}>
              Rooms
            </button>
          </div>
          {tab === 'campaigns' && (
            <div className="ee-actions">
              <button className="primary" onClick={onSave} disabled={!token} title={!token ? 'Please log in' : ''}>
                {campaign._id ? 'Update Campaign' : 'Create Campaign'}
              </button>
              <button className="ghost" onClick={() => { setCampaign(DEFAULT_CAMPAIGN()); setPreview([]); }} style={{ marginLeft: 8 }}>
                New
              </button>
              {campaign._id && (
                <button className="danger" onClick={onDelete} style={{ marginLeft: 8 }} disabled={!token} title={!token ? 'Please log in' : ''}>
                  Delete
                </button>
              )}
            </div>
          )}
        </header>

        {tab === 'campaigns' ? (
          <>
            <section style={{ borderTop: '1px solid #1f2937', paddingTop: 12 }}>
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>Name</span>
                  <input value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} required />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>Length</span>
                  <small style={{ color:'#9ca3af' }}>
                    Length is used only by the generator, not custom sequences.
                  </small>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={campaign.length}
                    onChange={(e) => setCampaign({ ...campaign, length: Number(e.target.value) })}
                    disabled={campaign._mode === 'sequence'}
                  />
                </label>

                <label className="full" style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                  <span>Cover (PNG/JPEG ≤ ~90KB)</span>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={async (e) => {
                        try {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const { dataUrl, mime, sizeKB } = await downscaleToImage(f, {
                            maxW: 1920,
                            maxH: 1080,
                            maxKB: 90,
                            quality: 0.9,
                          });
                          setCampaign((c) => ({ ...c, cover: { mime, data: dataUrl, sizeKB } }));
                        } catch (err) {
                          setMsg(err?.message || 'Upload failed');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                    <input
                      placeholder="or image URL"
                      onBlur={(e) => {
                        const url = e.target.value.trim();
                        if (!url) {
                          setCampaign((c) => ({ ...c, cover: undefined }));
                          return;
                        }
                        const isPNG = /\.png($|\?)/i.test(url);
                        const isJPG = /\.(jpe?g)($|\?)/i.test(url);
                        if (!isPNG && !isJPG) {
                          setMsg('Cover URL must end with .png or .jpg/.jpeg');
                          return;
                        }
                        const mime = isPNG ? 'image/png' : 'image/jpeg';
                        setCampaign((c) => ({ ...c, cover: { mime, data: url } }));
                      }}
                    />
                    {campaign.cover && (
                      <button type="button" className="danger" onClick={() => setCampaign((c) => ({ ...c, cover: undefined }))}>
                        Clear
                      </button>
                    )}
                  </div>
                  {campaign.cover?.data && <img src={campaign.cover.data} alt="cover" style={{ maxHeight: 140, marginTop: 6 }} />}
                </label>

                <label className="full" style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                  <span>Editing Choice</span>
                  <div className="row" style={{ gap: 8 }}>
                    <label>
                      <input
                        type="radio"
                        name="mode"
                        checked={campaign._mode === 'generator'}
                        onChange={() => setCampaign({ ...campaign, _mode: 'generator' })}
                      />
                      Generator
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="mode"
                        checked={campaign._mode === 'sequence'}
                        onChange={() => setCampaign({ ...campaign, _mode: 'sequence' })}
                      />
                      Custom Sequence
                    </label>
                  </div>
                  <small className="help" style={{ color: '#9ca3af' }}>
                    Generator uses weights and random loot (from this campaign). Custom Sequence uses your authored Rooms (and still respects “Insert Rest before …”).
                  </small>
                </label>
              </div>
            </section>

            <section style={{ borderTop: '1px solid #1f2937', paddingTop: 12 }}>
              <h3>Generator Settings</h3>
              <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>Use Weighted</span>
                  <select
                    value={campaign.generator.useWeighted ? 'true' : 'false'}
                    onChange={(e) => setGen({ useWeighted: e.target.value === 'true' })}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>Insert Rest Before</span>
                  <select
                    value={campaign.generator.insertRestBefore}
                    onChange={(e) => setGen({ insertRestBefore: e.target.value })}
                  >
                    <option value="boss">boss</option>
                    <option value="combat">combat</option>
                    <option value="none">none</option>
                  </select>
                </label>
              </div>

              <h4 style={{ margin: '12px 0 6px' }}>Room Weights</h4>
              <WeightsEditor weights={campaign.generator.roomWeights || []} onChange={(arr) => setGen({ roomWeights: arr })} />

              <h4 style={{ margin: '12px 0 6px' }}>Random Loot Pool</h4>
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>maxPicks</span>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={campaign.generator.randomLoot?.maxPicks ?? 1}
                    onChange={(e) =>
                      setGen({
                        randomLoot: { ...(campaign.generator.randomLoot || { items: [], maxPicks: 1 }), maxPicks: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              </div>
              <div className="list" style={{ display: 'grid', gap: 8 }}>
                {(campaign.generator.randomLoot?.items || []).map((it, i) => (
                  <LootItemRow key={i} value={it} onChange={(v) => changeRandomLoot(i, v)} onRemove={() => removeRandomLoot(i)} cards={cards} />
                ))}
                <button type="button" className="ghost" onClick={addRandomLoot}>
                  + Add loot item
                </button>
              </div>
            </section>

            <section style={{ borderTop: '1px solid #1f2937', paddingTop: 12 }}>
              <h3>Custom Sequence</h3>
              <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span>Add Room</span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        addRoomToSeq(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">-- choose room --</option>
                    {rooms.map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.name} ({r.type})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'grid', gap: 6 }}>
                {(campaign.roomSequence || []).map((id, i) => (
                  <li
                    key={`${id}-${i}`}
                    className="list-item"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}
                  >
                    <span>
                      {i + 1}. {nameOfRoom(id)}
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="ghost" type="button" onClick={() => moveSeq(i, -1)}>
                        ↑
                      </button>
                      <button className="ghost" type="button" onClick={() => moveSeq(i, +1)}>
                        ↓
                      </button>
                      <button className="danger" type="button" onClick={() => removeRoomFromSeq(i)}>
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
                {!campaign.roomSequence?.length && <li className="list-item">— empty sequence —</li>}
              </ul>
            </section>

            {/* Player Setup */}
            <section className="room" style={{ marginTop: 16 }}>
              <h3>Player Setup</h3>
              <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                <label>
                  Starting hand size
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={campaign.playerSetup?.startingHandSize ?? 3}
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        playerSetup: { ...(campaign.playerSetup || {}), startingHandSize: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  Min Deck Size
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={campaign.playerSetup?.minDeckSize ?? 30}
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        playerSetup: { ...(campaign.playerSetup || {}), minDeckSize: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  Max Deck Size
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={campaign.playerSetup?.maxDeckSize ?? 30}
                    onChange={(e) =>
                      setCampaign({
                        ...campaign,
                        playerSetup: { ...(campaign.playerSetup || {}), maxDeckSize: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                {/* Initial Player Stats */}
                <div className="room" style={{ marginTop: 12, minHeight: 280, paddingBottom: 12 }}>
                  <h4>Initial Player Stats</h4>
                  <small style={{ color:'#9ca3af', display:'block', marginBottom:6 }}>
                    Leave a field blank to use server defaults. HP blank ⇒ derived from vitality×100.
                  </small>

                  {(() => {
                    const s = campaign.playerSetup?.initialStats || {};
                    const setStat = (key, val) => {
                      setCampaign(c => ({
                        ...c,
                        playerSetup: {
                          ...(c.playerSetup || {}),
                          initialStats: {
                            ...(c.playerSetup?.initialStats || {}),
                            [key]: (val === '' || val === '-' ? undefined : Number(val))
                          }
                        }
                      }));
                    };
                    const StatInput = ({ name, label }) => (
                      <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        <span>{label}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="-?[0-9]*"
                          value={s[name] ?? ''}
                          onBeforeInput={(e) => {
                            // Disallow any character that would break /^-?\d*$/
                            if (!e.data) return; // navigation, deletions, etc.
                            const next = (e.currentTarget.value || '') + e.data;
                            if (!/^-?\d*$/.test(next)) e.preventDefault();
                          }}
                          onPaste={(e) => {
                            const t = e.clipboardData.getData('text');
                            const current = e.currentTarget.value || '';
                            const next = (current + t).replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
                            if (!/^-?\d*$/.test(next)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            // Final sanitize (handles deletions)
                            let raw = e.target.value;
                            raw = raw.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
                            // '' or '-' means "unset"
                            setStat(name, raw === '' || raw === '-' ? '' : raw);
                          }}
                        />
                      </label>
                    );
                    return (
                      <div
                        className="grid-3"
                        style={{
                          display:'grid',
                          gridTemplateColumns:'repeat(3, minmax(0, 1fr))',
                          gridAutoRows: 'minmax(60px, auto)',
                          gap:12
                        }}
                      >
                        <StatInput name="attackPower"       label="attackPower" />
                        <StatInput name="physicalPower"     label="physicalPower" />
                        <StatInput name="supernaturalPower" label="supernaturalPower" />
                        <StatInput name="durability"        label="durability" />
                        <StatInput name="vitality"          label="vitality" />
                        <StatInput name="intelligence"      label="intelligence" />
                        <StatInput name="speed"             label="speed" />
                        <StatInput name="sp"                label="sp" />
                        <StatInput name="maxSp"             label="maxSp" />
                        <StatInput name="hp"                label="hp (optional)" />
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={async () => {
                    const mod = await import('../api/editorApi');
                    const fetched = await mod.getCards(token, token ? 'mine' : 'all');
                    setCards(Array.isArray(fetched) ? fetched : []);
                  }}
                >
                  {cards.length ? 'Reload Cards' : (token ? 'Load My Cards' : 'Load Public Cards')}
                </button>
              </div>

              <div style={{ marginTop: 8 }}>
                <label>Starting Deck (order doesn’t matter; deck is shuffled at runtime)</label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(campaign.playerSetup?.startingDeck || []).map((id, i) => (
                    <div key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <select
                        value={id || ''}
                        onChange={(e) => {
                          const arr = (campaign.playerSetup?.startingDeck || []).slice();
                          arr[i] = e.target.value;
                          setCampaign({
                            ...campaign,
                            playerSetup: { ...(campaign.playerSetup || {}), startingDeck: arr },
                          });
                        }}
                      >
                        <option value="">— choose card —</option>
                        {cards.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const arr = (campaign.playerSetup?.startingDeck || []).slice();
                          arr.splice(i, 1);
                          setCampaign({
                            ...campaign,
                            playerSetup: { ...(campaign.playerSetup || {}), startingDeck: arr },
                          });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const arr = (campaign.playerSetup?.startingDeck || []).slice();
                      arr.push('');
                      setCampaign({
                        ...campaign,
                        playerSetup: { ...(campaign.playerSetup || {}), startingDeck: arr },
                      });
                    }}
                  >
                    + Add Card
                  </button>
                </div>
              </div>
            </section>

            <section style={{ borderTop: '1px solid #1f2937', paddingTop: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="ghost" onClick={generatePreview} disabled={!token} title={!token ? 'Please log in' : ''}>
                  Generate Preview
                </button>
              </div>
              <PreviewList path={preview} />
            </section>

            {msg && (
              <div
                className="ee-msg"
                style={{ marginTop: 12, padding: 10, background: '#052e16', border: '1px solid #14532d', color: '#a7f3d0', borderRadius: 8 }}
              >
                {msg}
              </div>
            )}
          </>
        ) : (
          <RoomEditor />
        )}
      </div>

      <aside
        className="ee-list"
        style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 10, padding: 16, color: '#e5e7eb' }}
      >
        <div className="list-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3>Campaigns</h3>
        </div>
        <input placeholder="filter by name…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filteredCampaigns.map((c) => (
            <li key={c._id} style={{ borderTop: '1px solid #1f2937', padding: '8px 0' }}>
              <button
                className="row"
                onClick={() => loadCampaign(c._id)}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
              >
                <span className="name" style={{ fontWeight: 600 }}>
                  {c.name}
                </span>
                <span className="meta" style={{ color: '#9ca3af', fontSize: 12 }}>
                  {Array.isArray(c.roomSequence) && c.roomSequence.length ? 'sequence' : 'generator'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
