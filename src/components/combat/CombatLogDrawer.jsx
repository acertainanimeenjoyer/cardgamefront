import React, { useState } from 'react';

export default function CombatLogDrawer({ logs = [] }) {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(logs) ? logs : [];

  return (
    <div
      // Fixed to viewport; sits centered-left and floats above everything
      style={{
        position: 'fixed',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none', // re-enable on children so nothing else is blocked
      }}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={open ? 'Hide combat log' : 'Show combat log'}
        style={{
          width: 44,
          height: 180,
          borderRadius: 12,
          border: '1px solid #8da2ce',
          background: '#101625',
          color: '#cbd5e1',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 0 0 2px rgba(141,162,206,.15) inset',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            letterSpacing: 2,
            fontWeight: 700,
          }}
        >
          ≡≡≡
        </span>
      </button>

      {/* Panel opens to the RIGHT of the button */}
      {open && (
        <div
          role="dialog"
          aria-label="Combat Log"
          style={{
            marginLeft: 12,
            width: 380,
            maxWidth: '28vw',
            background: '#0f1524',
            border: '1px solid #2e3a58',
            borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,.45)',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid #223',
              color: '#dbe5ff',
              fontWeight: 600,
            }}
          >
            <span>Combat Log</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close log"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aab7e7',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Scrollable entries – height ~10 rows */}
          <div
            style={{
              padding: 12,
              overflowY: 'auto',
              maxHeight: 'calc(1.45em * 10 + 8px)', // ~10 visible lines
              color: '#cbd5e1',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {items.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No events yet…</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {items.map((line, i) => (
                  <li key={i}>{String(line)}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
