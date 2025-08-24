import React from 'react';

/**
 * entries: [{ side: 'player' | 'enemy', text?: string, cardName?: string }]
 */
export default function PlayedFeed({ entries = [] }) {
  const list = Array.isArray(entries) ? entries.slice(-6) : [];
  return (
    <div className="played-feed">
      {list.length === 0 ? (
        <div className="muted">Played cards will appear here at end of turn.</div>
      ) : (
        <ul>
          {list.map((e, i) => (
            <li key={i} className={e.side === 'enemy' ? 'enemy' : 'player'}>
              <b>{e.cardName || 'Card'}</b> {e.text ? `— ${e.text}` : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
