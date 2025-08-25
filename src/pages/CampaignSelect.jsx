import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import campaignApi from '../services/campaignService';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/ModernGameUI.css';
// Decode JWT payload safely to fetch email (no external libs)
function getEmailFromToken(tok) {
  try {
    if (!tok) return undefined;
    const base64 = tok.split('.')[1];
    if (!base64) return undefined;
    const json = JSON.parse(decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('')));
    return (json?.email || json?.user?.email || '').toLowerCase().trim() || undefined;
  } catch { return undefined; }
}
const DEFAULT_CAMPAIGN_ID = 'PLACEHOLDER_CAMPAIGN_ID'; // TODO: replace when you have the real ID

export default function CampaignSelect() {
  const { token } = useContext(AuthContext);
  const [campaigns, setCampaigns] = useState([]);
  const [queryId, setQueryId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [liking, setLiking] = useState(null); // campaignId currently liking
  const [found, setFound] = useState(null);   // result of search-by-ID
  const [error, setError] = useState('');
  const [sort, setSort] = useState('none');   // 'none' | 'likes' | 'popularity'
  const navigate = useNavigate();
  const [likedMap, setLikedMap] = useState({}); // { [campaignId]: true|false }
  // load all campaigns
  const loadAll = async () => {
    try {
      setError('');
      const list = await campaignApi.listCampaigns(token, 'all');
      setCampaigns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError('Failed to load campaigns');
    }
  };

  useEffect(() => { loadAll(); }, [token]);

  // computed list to show (either the searched campaign or your whole list)
  const rows = useMemo(() => {
    const arr = (found ? [found] : campaigns).map(c => ({
      ...c,
      _likesDisplay: Number(c.likes ?? 0),
      _playingNow: Number(c.playingNow ?? 0)
    }));
    if (sort === 'likes') arr.sort((a, b) => b._likesDisplay - a._likesDisplay);
    else if (sort === 'popularity') arr.sort((a, b) => b._playingNow - a._playingNow);
    return arr;
  }, [found, campaigns, sort]);

  // search by ID: fetch the exact campaign by id
  const onSearchById = async (e) => {
    e?.preventDefault?.();
    const id = queryId.trim();
    if (!id) { setFound(null); setError(''); return; }
    try {
      setFetching(true);
      setError('');
      const got = await campaignApi.getCampaign(id, token);
      setFound(got?._id ? got : null);
      if (!got?._id) setError('No campaign with that ID');
    } catch {
      setFound(null);
      setError('No campaign with that ID');
    } finally {
      setFetching(false);
    }
  };

  const clearSearch = () => { setFound(null); setQueryId(''); setError(''); };
  const play = (id) => navigate(`/continue?campaign=${encodeURIComponent(id)}`);

  // Toggle like (one user/email can like once). Live update & anti-spam.
  const like = async (id) => {
    if (liking === id) return; // guard rapid double-clicks
    const email = getEmailFromToken(token);
    try {
      setLiking(id);
      // Optimistic UI update (flip heart & +/- 1 on count)
      setLikedMap(m => ({ ...m, [id]: !m[id] }));
      setCampaigns(list => list.map(c => {
        if (c._id !== id) return c;
        const currentlyLiked = likedMap[id] ?? !!c.liked;
        const delta = currentlyLiked ? -1 : 1;
        return { ...c, likes: Math.max(0, Number(c.likes || 0) + delta) };
      }));
      if (found?._id === id) {
        setFound(f => {
          if (!f) return f;
          const currentlyLiked = likedMap[id] ?? !!f.liked;
          const delta = currentlyLiked ? -1 : 1;
          return { ...f, likes: Math.max(0, Number(f.likes || 0) + delta) };
        });
      }

      // Call API; include email so backend can anchor toggling by email
      const resp = await fetch(`/api/campaigns/${id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });
      if (!resp.ok) throw new Error('toggle failed');
      const data = await resp.json().catch(() => ({})); // { liked, likes }

      // Reconcile with server truth
      setLikedMap(m => ({ ...m, [id]: !!data.liked }));
      setCampaigns(list => list.map(c => c._id === id ? { ...c, likes: Number(data.likes ?? c.likes ?? 0) } : c));
      if (found?._id === id) setFound(f => f ? { ...f, likes: Number(data.likes ?? f.likes ?? 0) } : f);
    } catch {
      // Roll back optimistic flip on failure
      setLikedMap(m => ({ ...m, [id]: !!m[id] })); // flip back
      // optional: toast error
    } finally {
      setLiking(null);
    }
  };

  return (
    <div className="page-bg" style={{ padding: 24 }}>
      <div className="room" style={{ padding: 16 }}>
        <header className="row" style={{ justifyContent:'space-between', alignItems:'center', marginBottom: 12 }}>
          <h2>Choose a Campaign</h2>
          <div className="row" style={{ gap: 8 }}>
            <label className="row" style={{ gap:8, alignItems:'center' }}>
              <span>Sort:</span>
              <select value={sort} onChange={(e)=>setSort(e.target.value)}>
                <option value="none">None</option>
                <option value="likes">Likes</option>
                <option value="popularity">Popularity</option>
              </select>
            </label>
          </div>
        </header>

        <section style={{ marginBottom: 12 }}>
          <form className="row" onSubmit={onSearchById} style={{ gap: 8 }}>
            <input
              value={queryId}
              onChange={(e)=>setQueryId(e.target.value)}
              placeholder="Search by Campaign ID…"
              style={{ flex: 1 }}
            />
            <button className="primary" type="submit" disabled={fetching}>
              {fetching ? 'Searching…' : 'Search'}
            </button>
            {found && <button type="button" className="ghost" onClick={clearSearch}>Clear</button>}
          </form>
          {error && <div style={{ color:'#fca5a5', marginTop:6 }}>{error}</div>}
        </section>

        <section className="list-item" style={{ padding: 12, marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="row" style={{ gap: 12, alignItems: 'center' }}>
              <div style={{ width: 64, height: 40, background:'#111', display:'grid', placeItems:'center', borderRadius:6, border:'1px solid #333', fontSize:12, color:'#9ca3af' }}>
                DEF
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Default Campaign</div>
                <small style={{ opacity: .7 }}>ID: {DEFAULT_CAMPAIGN_ID}</small>
              </div>
            </div>
            <div className="row" style={{ gap:8 }}>
              <button className="primary" onClick={() => play(DEFAULT_CAMPAIGN_ID)}>Play</button>
            </div>
          </div>
        </section>

        <div style={{ maxHeight: '60vh', overflowY: 'auto', border:'1px solid #1f2937', borderRadius: 10 }}>
          {rows.map(c => {
            const liked = likedMap[c._id] ?? !!c.liked;
            const thumb =
            (c.cover && typeof c.cover.data === 'string' && c.cover.data.trim())
              ? c.cover.data.trim()
              : (c.thumbnail && typeof c.thumbnail.data === 'string' && c.thumbnail.data.trim())
                ? c.thumbnail.data.trim()
                : null;
            return (
            <div key={c._id} className="list-item" style={{ padding: 12, borderBottom:'1px solid #1f2937', cursor:'pointer' }}
                 onClick={() => play(c._id)}>
              <div className="row" style={{ justifyContent:'space-between', alignItems:'center' }}>
                <div className="row" style={{ gap: 12, alignItems:'center' }}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      style={{ width: 64, height: 40, objectFit: 'cover', borderRadius:6, border:'1px solid #333', background:'#111' }}
                      onError={(e)=>{ e.currentTarget.style.visibility='hidden'; }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 64, height: 40, borderRadius: 6, border: '1px solid #333',
                        background: '#111', color: '#9ca3af', display: 'grid', placeItems: 'center',
                        fontSize: 12
                      }}
                    >
                      NO ART
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700 }}>{c.name || '(untitled campaign)'}</div>
                    <small style={{ color:'#9ca3af' }}>
                      Likes: {c._likesDisplay} • Playing now: {c._playingNow}
                    </small>
                  </div>
                </div>
                <div className="row" style={{ gap:8 }} onClick={(e)=>e.stopPropagation()}>
                  <button className="ghost" onClick={() => like(c._id)} disabled={liking === c._id}>
                    {liking === c._id ? (liked ? '♥ Removing…' : '♥ Liking…') : (liked ? '♥ Liked' : '♥ Like')}
                  </button>
                  <button className="primary" onClick={() => play(c._id)}>Play</button>
                </div>
              </div>
            </div>
          )})}
          {!rows.length && (
            <div className="list-item" style={{ padding: 12, textAlign:'center', color:'#9ca3af' }}>
              No campaigns found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
