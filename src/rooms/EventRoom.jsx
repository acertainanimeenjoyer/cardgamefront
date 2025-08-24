// src/rooms/EventRoom.jsx
import React, { useEffect, useState, useContext, useCallback } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import roomApi from '../api/roomApi';
import '../styles/GamePage.css';
const bgUrl = (room) => room?.backgrounds?.[0]?.data || '';
/**
 * EventRoom:
 * - Loads normalized event via GET /api/rooms/:id/event
 */
const EventRoom = ({ room, roomId, onNext, onApplyEvent, onRecruit }) => {
  const { token } = useContext(AuthContext);
  const rid = room?._id || room?.id || roomId;

  const [payload, setPayload] = useState(null);   // { event, backgrounds }
  const [page, setPage] = useState(0);
  const [choiceOpen, setChoiceOpen] = useState(false); // recruit overlay
  const [busy] = useState(false);
  const [applying] = useState(false);

  // Load event payload
  useEffect(() => {
    if (!rid) return;
    setPayload(null);
    setChoiceOpen(false);

    roomApi.getEvent(rid, token)
      .then((p) => {
        setPayload(p);
        // do NOT auto-open the recruit choice anymore; user must press "Confirm"
        setChoiceOpen(false);
      })
      .catch(() => {
        // Graceful fallback: let player proceed
        setPayload({
          event: { kind: 'story-only', vnText: [], effects: [] },
          backgrounds: room?.backgrounds || []
        });
        setChoiceOpen(false);
      });
  }, [rid, token, room]);

  const ev = payload?.event || {};

  const advance = useCallback(() => {
    if (choiceOpen || busy || applying) return;           // don’t skip past choice / while busy
    if (!ev?.vnText?.length) { onNext?.(); return; }
    if (page < ev.vnText.length - 1) setPage(p => p + 1);
    else onNext?.();
  }, [choiceOpen, busy, ev, page, onNext]);

  if (!payload) {
    return (
      <div className="room event-room"><div>Loading event…</div></div>
    );
  }

  return (
    <div
      className="room event-room"
      onClick={advance}
      style={bgUrl(payload) ? { backgroundImage: `url(${bgUrl(payload)})`, backgroundSize:'cover' } : {}}
    >
      <div className="vn-dialog">
        <div className="vn-text">
          {(ev.vnText && ev.vnText[page]) || '...'}
        </div>
        <div className="vn-meta">
          {choiceOpen ? 'make a choice' : 'click anywhere to continue'}
        </div>
      </div>
    </div>
  );
};

export default EventRoom;