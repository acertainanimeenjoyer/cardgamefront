// src/api/editorApi.js
import apiService from '../services/apiService';
import { request } from '../services/apiService';

// Cards
export const createCard  = (payload, token) => apiService.request({ url: '/api/cards',           method: 'POST', data: payload, token });
export const updateCard  = (id, payload, token) => apiService.request({ url: `/api/cards/${id}`,  method: 'PUT',  data: payload, token });
export const getCards    = (token, scope = 'mine') => apiService.request({
  url: `/api/cards${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, method: 'GET', token
});

// Enemies
export const getEnemies  = (token, scope = 'mine') => apiService.request({
  url: `/api/enemies${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, method: 'GET', token
});
export const getEnemy    = (id, token) => apiService.request({ url: `/api/enemies/${id}`, method: 'GET', token });
export const createEnemy = (payload, token) => apiService.request({ url: '/api/enemies', method: 'POST', data: payload, token });
export const updateEnemy = (id, payload, token) => apiService.request({ url: `/api/enemies/${id}`, method: 'PUT',   data: payload, token });
export const deleteEnemy = (id, token) => apiService.request({ url: `/api/enemies/${id}`, method: 'DELETE', token });
