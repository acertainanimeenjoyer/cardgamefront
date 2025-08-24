import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import campaignService from '../services/campaignService';

// Wrap routes that represent "being inside a run"
export default function ContinueGuard() {
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    let cancel = false;
    (async () => {
      let saved = null;
      const inRun = pathname.startsWith('/run/') || pathname.startsWith('/game');
      try {
        saved = await campaignService.loadSavedGame();
        const canContinue =
          !!saved && (Array.isArray(saved.campaign) ? saved.roomIndex < saved.campaign.length : true);
        if (!cancel && saved) {
          // if Continue just approved a run, allow one pass and consume the flag
          const allow = sessionStorage.getItem('allowRunOnce') === '1';
          if (allow) {
            sessionStorage.removeItem('allowRunOnce');
          } else if (canContinue && !inRun && !pathname.startsWith('/continue')) {
            navigate(`/continue${search || ''}`, { replace: true });
            return;
          }
        }
      } catch {
        // no save → proceed
      }
      // Fresh start: autostart run & skip Continue if campaignId is present and no save exists
      const params = new URLSearchParams(search || '');
      const campaignId = params.get('campaign');
      if (!saved && campaignId && !inRun) {
        try {
          await campaignService.startRun(campaignId, {});
          sessionStorage.setItem('allowRunOnce', '1'); // one-hop allowance
          navigate(`/run/${encodeURIComponent(campaignId)}`, { replace: true });
          return;
        } catch {
          // If start fails, we’ll fall through and let normal routing proceed
        }
      }
      if (!cancel) setReady(true);
    })();
    return () => { cancel = true; };
  }, [pathname, search, navigate]);

  if (!ready) return null; // or a lightweight loader
  return <Outlet />;
}
