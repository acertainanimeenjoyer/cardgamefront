import React from 'react';

export default function CardDescDialog({ open, card, onClose }) {
  if (!open || !card) return null;
  return (
    <div className="desc-modal-backdrop" onClick={onClose}>
      <div className="desc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="desc-modal__hdr">
          <strong>{card.name || 'Card'}</strong>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="desc-modal__body">
          {card.description || 'No description.'}
        </div>
      </div>
    </div>
  );
}
