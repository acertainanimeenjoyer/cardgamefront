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

const EnemyPanel = ({ enemy, delta = {} }) => (
  <div className="enemy-panel">
    <h3>{enemy?.name || 'Enemy'}</h3>
    <div>HP: {enemy?.stats?.hp ?? '-'}</div>
    <div>SP: {enemy?.stats?.sp ?? 3} / {enemy?.stats?.maxSp ?? 5}</div>
    <div>Attack: {formatWithDelta(enemy?.stats?.attackPower ?? 0, delta.attackPower || 0)}</div>
    <div>PHY: {formatWithDelta(enemy?.stats?.physicalPower ?? 0, delta.physicalPower || 0)}</div>
    <div>SPR: {formatWithDelta(enemy?.stats?.supernaturalPower ?? 0, delta.supernaturalPower || 0)}</div>
    <div>Defense: {enemy?.stats?.defense ?? '-'}</div>
    <div>Speed: {enemy?.stats?.speed ?? '-'}</div>
  </div>
);

export default EnemyPanel;
