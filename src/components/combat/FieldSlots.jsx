import React from 'react';
import CardTile from '../cards/CardTile';
import '../../styles/CombatLayout.css'; // (optional if you want a separate file)

/**
 * FieldSlots
 * Renders exactly 4 “wells” per side. If an item exists, show a mini CardTile.
 * items: [{ instanceId, turnsRemaining, card: {...} }, ...]
 * owner: 'enemy' | 'player'    (affects subtle styles if needed)
 */
export default function FieldSlots({ owner = 'enemy', items = [] }) {
  const MAX = 4;
  const filled = Array.isArray(items) ? items.slice(0, MAX) : [];
  const empties = Math.max(0, MAX - filled.length);

  return (
    <div className={`panel field-panel ${owner}`}>
      <div className="panel-title" style={{ marginBottom: 8 }}>
        {owner === 'enemy' ? 'Enemy Field' : 'Your Field'}
      </div>

      <div className="field-row cards">
        {filled.map((f, i) => (
          <div className="field-slot card" key={f.instanceId || i} title={`${Math.max(0, f.turnsRemaining)} turn(s) left`}>
            <CardTile card={f.card || { name: 'Card' }} variant="mini" />
            <div className="slot-turns">{Math.max(0, f.turnsRemaining)}T</div>
          </div>
        ))}

        {[...Array(empties)].map((_, i) => (
          <div className="field-slot empty" key={`e${i}`} />
        ))}
      </div>
    </div>
  );
}
