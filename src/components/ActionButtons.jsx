import React, { useState } from 'react';

const ActionButtons = ({ canPlay, onPlay, onDefend, onSkip }) => {
  const [cooldown, setCooldown] = useState(false);

  const handleClick = (cb) => {
    if (cooldown) return;
    setCooldown(true);
    cb();
    setTimeout(() => setCooldown(false), 500);
  };

  return (
    <div className="action-buttons">
      <button onClick={() => handleClick(onPlay)} disabled={!canPlay || cooldown}>▶️ Play Turn</button>
      <button onClick={() => handleClick(onDefend)} disabled={cooldown}>🛡️ Defend</button>
      <button onClick={() => handleClick(onSkip)} disabled={cooldown}>↷ Skip</button>
    </div>
  );
};

export default ActionButtons;
