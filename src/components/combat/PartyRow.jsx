import React from 'react';
import CharacterBadge from './CharacterBadge';

/**
 * party: [{ name, imageUrl, stats, delta }]
 */
export default function PartyRow({ party = [], renderDetails }) {
  const arr = Array.isArray(party) && party.length ? party : [{ name: 'You', stats: {}, delta: {} }];
  return (
    <div className="party-row">
      {arr.map((p, i) => (
        <CharacterBadge
          key={p?.id || p?.name || i}
          side="player"
          name={p?.name || `Ally ${i+1}`}
          imageUrl={p?.imageUrl}
          stats={p?.stats || {}}
          delta={p?.delta || {}}
          renderDetails={typeof renderDetails === 'function' ? renderDetails(p, i) : undefined}
        />
      ))}
    </div>
  );
}
