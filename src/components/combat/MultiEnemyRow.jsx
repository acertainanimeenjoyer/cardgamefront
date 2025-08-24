import React from 'react';
import CharacterBadge from './CharacterBadge';

export default function MultiEnemyRow({ enemies = [], renderDetails }) {
  const arr = Array.isArray(enemies) ? enemies.slice(0, 4) : [];
  return (
    <div className="enemy-row">
      {arr.length === 0 ? <div className="placeholder">Enemies will appear here</div> : null}
      {arr.map((e, i) => (
        <CharacterBadge
          key={e?._id || i}
          side="enemy"
          name={e?.name || `Enemy ${i+1}`}
          imageUrl={e?.imageUrl}
          stats={e?.stats || {}}
          delta={{}}
          renderDetails={typeof renderDetails === 'function' ? renderDetails(e, i) : undefined}
        />
      ))}
    </div>
  );
}
