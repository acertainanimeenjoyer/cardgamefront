import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/ModernGameUI.css';

export default function EditorMenu() {
  return (
    <div className="room" style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 12 }}>Editor Menu</h2>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Choose what you want to edit.
      </p>

      <div
        className="list"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        <Link to="/edit/campaigns" className="list-item" style={{ padding: 16 }}>
          <h3 style={{ margin: 0 }}>Campaign Editor</h3>
          <small style={{ opacity: 0.8 }}>
            Build campaigns (Generator or Custom Sequence) and author Rooms.
          </small>
        </Link>

        <Link to="/edit/cards" className="list-item" style={{ padding: 16 }}>
          <h3 style={{ margin: 0 }}>Card Editor</h3>
          <small style={{ opacity: 0.8 }}>
            Create and tweak cards (art, stats, cost, effects).
          </small>
        </Link>

        <Link to="/edit/enemies" className="list-item" style={{ padding: 16 }}>
          <h3 style={{ margin: 0 }}>Enemy Editor</h3>
          <small style={{ opacity: 0.8 }}>
            Author enemies and their combat parameters.
          </small>
        </Link>
      </div>

      <div className="room-actions" style={{ marginTop: 18 }}>
        <Link to="/" className="ghost">← Back to Main Menu</Link>
      </div>
    </div>
  );
}
