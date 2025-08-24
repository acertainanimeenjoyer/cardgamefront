import React from 'react';

const formatWithDelta = (base, delta) => {
  if (typeof base !== 'number') base = 0;
  if (!delta) return String(base);
  const sign = delta > 0 ? '+' : '';
  const cls  = delta > 0 ? 'pos' : 'neg';
  return (
    <>
      {base} <span className={cls}>({sign}{delta})</span>
    </>
  );
};

const PlayerPanel = ({ player, delta = {} }) => (
  <div className="player-panel">
    <h3>Player</h3>
    <div>HP: {player.hp}</div>
    <div>SP: {player.sp ?? 3} / {player.maxSp ?? 5}</div>
    <div>Attack: {formatWithDelta(player.attackPower, delta.attackPower || 0)}</div>
    <div>PHY: {formatWithDelta(player.physicalPower, delta.physicalPower || 0)}</div>
    <div>SPR: {formatWithDelta(player.supernaturalPower, delta.supernaturalPower || 0)}</div>
    <div>Defense: {player.defense}</div>
    <div>Speed: {player.speed}</div>
  </div>
);

export default PlayerPanel;
