import { useEffect, useState } from 'react';
// optional: if you want it to self-load from SavedGame, uncomment next line
// import campaignService from '../services/campaignService';
import '../styles/ModernGameUI.css';

export default function MoneyIndicator({ amount, autoLoad = false }) {
  const [value, setValue] = useState(Number(amount ?? 0));

  useEffect(() => {
    setValue(Number(amount ?? 0));
  }, [amount]);

  // Optional self-loading mode (leave off unless you need it)
  // useEffect(() => {
  //   if (!autoLoad) return;
  //   (async () => {
  //     try {
  //       const sg = await campaignService.loadSavedGame();
  //       setValue(Number((sg?.data ?? sg)?.money ?? 0));
  //     } catch {
  //       /* ignore */
  //     }
  //   })();
  // }, [autoLoad]);

  return (
    <div className="hud-money" aria-live="polite">
      <div className="hud-money__chip">
        <span className="hud-money__coin" aria-hidden>🪙</span>
        <span className="hud-money__label">Gold</span>
        <span className="hud-money__value">{value}</span>
      </div>
    </div>
  );
}
