// src/api/roomApi.js
import apiService from '../services/apiService';

// Fetch a full room doc by id (used by RunManager to inflate id-only sequence items)
export const getRoom = (roomId, token) =>
  apiService.request({
    url: `/api/rooms/${roomId}`,
    method: 'GET',
    token,
  });

// Loot payload for a room
export const getLoot = (roomId, token) =>
  apiService.request({
    url: `/api/rooms/${roomId}/loot`,
    method: 'GET',
    token,
  });

// Event payload for a room
export const getEvent = (roomId, token) =>
  apiService.request({
    url: `/api/rooms/${roomId}/event`,
    method: 'GET',
    token,
  });

// Merchant inventory for a room
export const getMerchant = (roomId, token) =>
  apiService.request({
    url: `/api/rooms/${roomId}/merchant`,
    method: 'GET',
    token,
  });

// Merchant purchase
export const buyMerchant = (roomId, itemIndex, token, gameId) =>
  apiService.request({
    url: `/api/rooms/${roomId}/merchant/buy${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''}`,
    method: 'POST',
    data: { itemIndex, ...(gameId ? { gameId } : {}) },
    token,
    headers: gameId ? { 'x-game-id': gameId } : undefined,
  });

// --- CRUD for authoring ---
export const listRooms = (token, scope = 'mine') =>
  apiService.request({
    url: `/api/rooms${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`,
    method: 'GET',
    token,
  });

export const getRoomById = (id, token) =>
  apiService.request({
    url: `/api/rooms/${id}`,
    method: 'GET',
    token,
  });

export const createRoom = (body, token) =>
  apiService.request({
    url: '/api/rooms',
    method: 'POST',
    data: body,
    token,
  });

export const updateRoom = (id, body, token) =>
  apiService.request({
    url: `/api/rooms/${id}`,
    method: 'PATCH',
    data: body,
    token,
  });

export const deleteRoom = (id, token) =>
  apiService.request({
    url: `/api/rooms/${id}`,
    method: 'DELETE',
    token,
  });

// Event: recruit a character into the player's save
export const recruitEvent = (roomId, { actorId, addToTeam = true, position = 'end' }, token) =>
  apiService.request({
    url: `/api/rooms/${roomId}/event/recruit`,
    method: 'POST',
    data: { actorId, addToTeam, position },
    token,
  });

// Optional default so legacy `import roomApi from '...'` still works:
export default {
  getRoom,
  getLoot,
  getEvent,
  recruitEvent,
  getMerchant,
  buyMerchant,
  listRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};