import React from 'react';

export default function EffectsSidebar({ title='Effects', effects = [], side='player' }) {
  const list = Array.isArray(effects) ? effects : [];
  return (
    <aside className={`effects-sidebar ${side}`}>
      <div className="title">{title}</div>
      {list.length === 0 ? (
        <div className="muted">None</div>
      ) : (
        <ul className="fx">
          {list.map((e, i) => (
            <li key={i}>
              <b>{e.type}</b>
              {e.target && <span className="muted"> ({e.target})</span>}
              {typeof e.power === 'number' && <> · +{e.power}</>}
              {typeof e.remaining === 'number' && <> · {e.remaining}T</>}
              {typeof e.precedence === 'number' && <> · p{e.precedence}</>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
