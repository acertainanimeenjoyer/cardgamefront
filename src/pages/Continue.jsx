// src/pages/Continue.jsx
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import campaignService from '../services/campaignService';

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Continue() {
  const q = useQuery();
  const navigate = useNavigate();

  const campaignId = q.get('campaign'); // ?campaign=<id> when starting from a campaign card
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(null); // server SavedGame doc or null
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await campaignService.loadSavedGame();
        if (!cancel) setSaved(res?.data || res || null);
      } catch (e) {
        // 404 → no saved game; treat as null
        if (!cancel) setSaved(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // decide if the existing save matches the campaign the user is trying to start
  const matchesCampaign = useMemo(() => {
    if (!saved || !campaignId) return true; // allow continue page for reload
    const progId = saved?.progress?.campaignId;
    return !progId || String(progId) === String(campaignId);
  }, [saved, campaignId]);

  const canContinue = !!saved && (Array.isArray(saved.campaign) ? saved.roomIndex < saved.campaign.length : true);

  async function onContinue() {
    // Prefer explicit run route so RunManager orchestrates combat
    const destId =
      campaignId ||
      (saved?.progress?.campaignId ? String(saved.progress.campaignId) : null);
    sessionStorage.setItem('allowRunOnce', '1');
    if (destId) navigate(`/run/${encodeURIComponent(destId)}`);
    else navigate('/campaigns');
  }

  async function onStartOver() {
    try {
      await campaignService.clearSavedGame();
    } catch { /* ignore */ }
    if (campaignId) {
      await campaignService.startRun(campaignId, {});
      sessionStorage.setItem('allowRunOnce', '1');
      navigate(`/run/${encodeURIComponent(campaignId)}`);
    } else {
      // If we don't know which campaign, send them to selector
      navigate('/campaigns');
    }
  }

  // If user pressed Start on a campaign and there is no save, start it automatically
  //Auto start the run if we have a campaignId and no saved game
  useEffect(() => {
    if (!loading && !saved && campaignId) {
      (async () => {
        try {
          await campaignService.startRun(campaignId, {});
          sessionStorage.setItem('allowRunOnce', '1');
          navigate(`/run/${encodeURIComponent(campaignId)}`);
        } catch {
          // if start endpoint not yet wired, we keep the Start Over button visible
        }
      })();
    }
  }, [loading, saved, campaignId, navigate]);

  if (loading) return <div style={{padding:24, color:'#cbd5e1'}}>Loading save…</div>;

  // Existing save from a different campaign – prompt to replace
  if (!matchesCampaign) {
    return (
      <ContinueFrame>
        <h2>Another run is in progress</h2>
        <p style={{opacity:.8}}>You already have a run for a different campaign. Start over?</p>
        <div className="row">
          <button className="ghost" onClick={() => navigate('/campaigns')}>Back</button>
          <button className="danger" onClick={onStartOver}>Start Over</button>
        </div>
      </ContinueFrame>
    );
  }

  // No save and no campaign requested → send to selector
  if (!saved && !campaignId) {
    navigate('/campaigns');
    return null;
  }

  // Normal case: we have a save → ask to continue or start over
  return (
    <ContinueFrame>
      <h2>Continue your run?</h2>

      {saved && (
        <div className="summary">
          <div><strong>Room</strong>: {Number(saved.roomIndex ?? 0) + 1}</div>
          {'money' in saved ? <div><strong>Money</strong>: {saved.money}</div> : null}
          {Array.isArray(saved.campaign) ? <div><strong>Rooms Total</strong>: {saved.campaign.length}</div> : null}
        </div>
      )}

      <div className="row">
        {canContinue && <button className="primary" onClick={onContinue}>Continue</button>}
        <button className="danger" onClick={onStartOver}>Start Over</button>
      </div>
    </ContinueFrame>
  );
}

function ContinueFrame({ children }) {
  return (
    <div style={{
      maxWidth: 520, margin: '8vh auto', padding: 20,
      background: '#111827', border: '1px solid #2a334a', borderRadius: 12,
      color: '#e9ecf4', boxShadow: '0 10px 32px rgba(0,0,0,.35)'
    }}>
      {children}
      <style>{`
        .row { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
        .primary { background:#4e6cb8; color:#fff; border:0; padding:10px 16px; border-radius:8px; cursor:pointer; }
        .danger  { background:#c0392b; color:#fff; border:0; padding:10px 16px; border-radius:8px; cursor:pointer; }
        .ghost   { background:transparent; color:#cbd5e1; border:1px solid #2e3a58; padding:10px 16px; border-radius:8px; cursor:pointer; }
        .summary { display:grid; gap:6px; margin:12px 0; opacity:.9; }
      `}</style>
    </div>
  );
}
