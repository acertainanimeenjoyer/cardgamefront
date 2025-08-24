// CardTile.jsx
import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import './CardTile.css';
import api from '../../services/apiService'; // ← adjust path if needed

// in-memory cache so multiple tiles don’t refetch the same id
const cardImgCache = new Map();

export default function CardTile({
  card = {},
  variant = 'hand',
  selected = false,
  disabled = false,
  onSelect,
  onDesc,
}) {
  const [openInfo, setOpenInfo] = useState(false);

  const rating = card?.rating || 'N';
  const typeLetters = Array.isArray(card?.type)
    ? card.type.map(t => (t?.[0] || '')).join('/')
    : (card?.type?.[0] || '');
  const atkType = (card?.attackType || 'Single');
  const atk = card?.potency ?? 0;
  const def = card?.defense ?? 0;

  // inline image (fast path)
  const inlineImg =
    card?.imageUrl ||
    card?.cardEffect?.visual?.data ||
    card?.descThumbUrl ||
    '';

  // id we can use to resolve from server if inline is missing
  const cardId = useMemo(
    () => (card?._id || card?.id || card?.cardId || null),
    [card]
  );

  // resolved image from fetch/cache
  const [resolvedImg, setResolvedImg] = useState('');

  useEffect(() => {
    let cancelled = false;
    // if we already have an image, skip fetching
    if (inlineImg || !cardId) {
      setResolvedImg('');
      return;
    }
    const key = String(cardId);
    const cached = cardImgCache.get(key);
    if (cached) {
      setResolvedImg(cached);
      return;
    }
    // fetch full card doc and extract its image field
    (async () => {
      try {
        const doc = await api.request(`/api/cards/${key}`, 'GET');
        const imgFromDoc =
          doc?.imageUrl ||
          doc?.cardEffect?.visual?.data ||
          doc?.descThumbUrl ||
          '';
        if (!cancelled && imgFromDoc) {
          cardImgCache.set(key, imgFromDoc);
          setResolvedImg(imgFromDoc);
        }
      } catch {
        // swallow; placeholder will render
      }
    })();
    return () => { cancelled = true; };
  }, [cardId, inlineImg]);

  // final image to render (preserves existing markup)
  const img = inlineImg || resolvedImg;

  const abilities = Array.isArray(card?.abilities) ? card.abilities : [];
  const canSelect = variant === 'hand' && (!disabled || selected);

  return (
    <div
      className={`card-tile ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''} ${variant}`}
      onClick={canSelect ? onSelect : undefined}
      role="button"
      aria-pressed={!!selected}
      tabIndex={0}
    >
      <div className="ct-body">
        <div className="ct-head">
          <span className="ct-rarity">{rating}</span>
          <span className="ct-name">{card?.name || 'Card name'}</span>
          <span className="ct-typecode">{typeLetters}</span>
        </div>

        {/* image box (unchanged markup/classes) */}
        <div className="ct-image">
          {img ? <img src={img} alt={`${card?.name || 'Card'} art`} /> : <div className="ct-img-ph">Card&apos;s image</div>}
        </div>

        {variant === 'hand' && (
          <div
            className="ct-desc"
            onClick={(e) => {
              e.stopPropagation();
              if (typeof onDesc === 'function') onDesc(); else setOpenInfo(v => !v);
            }}
            title="Click to view full description"
            role="button"
          >
            {card?.description ? 'click to view full desc' : 'no description'}
          </div>
        )}

        <div className="ct-footer">
          <span className="ct-at-value">{atkType}</span>
          <div className="ct-stats-wrapper">
            <button
              type="button"
              className="ct-info-btn"
              title="Show details"
              onClick={(e) => { e.stopPropagation(); setOpenInfo(v => !v); }}
            >
              !
            </button>
            <span className="ct-ad">{atk}{def ? ` / ${def}` : ''}</span>
          </div>
        </div>
      </div>

      {openInfo && (
        <div className="ct-popover" onClick={(e) => e.stopPropagation()}>
          <div className="ctp-title">{card?.name || 'Card'}</div>
          <div className="ctp-row"><b>Types:</b> {Array.isArray(card?.type) ? card.type.join(', ') : (card?.type || '—')}</div>
          {card?.attackType && <div className="ctp-row"><b>Attack Type:</b> {card.attackType}</div>}
          {typeof card?.potency === 'number' && <div className="ctp-row"><b>Potency:</b> {card.potency}</div>}
          {typeof card?.defense === 'number' && <div className="ctp-row"><b>Defense:</b> {card.defense}</div>}
          {card?.spCost !== undefined && <div className="ctp-row"><b>SP Cost:</b> {card.spCost}</div>}
          <div className="ctp-block">
            <div className="ctp-block-title">Abilities</div>
            <ul className="ctp-list">
              {(abilities.length ? abilities : [{ type: 'None' }]).map((ab, i) => (
                <li key={i}>
                  <b>{ab.type || ab.name}</b>
                  {ab.key !== undefined ? ` (${ab.key})` : ''}
                  {ab.power !== undefined ? ` · pow ${ab.power}` : ''}
                  {ab.duration !== undefined ? ` · ${ab.duration}T` : ''}
                  {ab.activationChance !== undefined ? ` · ${ab.activationChance}%` : ''}
                  {ab.precedence !== undefined ? ` · p${ab.precedence}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
