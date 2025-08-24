import React, { useState, useRef, useEffect } from 'react';

export default function CharacterBadge({
  name, imageUrl, hp, atk, stats, side = 'enemy', onClick
}) {
  const [openInfo, setOpenInfo] = useState(false);
  const badgeRef = useRef(null);

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      if (!badgeRef.current) return;
      if (!badgeRef.current.contains(e.target)) setOpenInfo(false);
    };
    if (openInfo) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openInfo]);

  return (
    <div ref={badgeRef} className="char-badge" onClick={onClick}>
      <div
        className="avatar"
        style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}
      />
      <div className="info">
        <div className="name">{name}</div>
        <div className="quick">
          <span>HP {hp ?? stats?.hp ?? '—'}</span>
          <span className="sep">/</span>
          <span>ATK {atk ?? stats?.attackPower ?? '—'}</span>
          <button
            type="button"
            className="cbadge-info-btn"
            onClick={(e) => { e.stopPropagation(); setOpenInfo((v) => !v); }}
            title="Show full stats"
          >
            ⓘ
          </button>
        </div>
      </div>

      {openInfo && (
        <div className="cbadge-details-floating" onClick={(e) => e.stopPropagation()}>
          <div className="bp-title">{name}</div>
          <dl className="bp-stats">
            <div><dt>HP:</dt><dd>{stats?.hp}</dd></div>
            <div><dt>SP:</dt><dd>{stats?.sp} / {stats?.maxSp}</dd></div>
            <div><dt>Attack:</dt><dd>{stats?.attackPower}</dd></div>
            <div><dt>PHY:</dt><dd>{stats?.physicalPower}</dd></div>
            <div><dt>SPR:</dt><dd>{stats?.supernaturalPower}</dd></div>
            <div><dt>Defense:</dt><dd>{stats?.defense}</dd></div>
            <div><dt>Speed:</dt><dd>{stats?.speed}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
