// src/services/campaignService.js
import api from './apiService';

const getDefaultCampaign = (length = 7, token) =>
  api.request(`/api/campaigns/default/${length}`, 'GET', undefined, token);

const generateCampaign = (id, body = {}, token) =>
  api.request(`/api/campaigns/${id}/generate`, 'POST', body, token);

const getCampaignSequence = (id, token) =>
  api.request(`/api/campaigns/${id}/sequence`, 'GET', undefined, token);

// ----- SavedGame helpers -----
const loadSavedGame = () =>
  api.request(`/api/game/load`, 'GET');

// clear: try DELETE /api/game/save if you added it; otherwise ignore failure
const clearSavedGame = async () => {
  try { await api.request(`/api/game/save`, 'DELETE'); } catch { /* ignore 404 */ }
};

// Start or resume a run for a campaign (backend we added in campaignController)
const startRun = (campaignId, body = {}, token) =>
  api.request(`/api/campaigns/${campaignId}/start`, 'POST', body, token);

// --- CRUD for authoring ---
const listCampaigns  = (token, scope = 'mine') =>
  api.request(`/api/campaigns${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, 'GET', undefined, token);
const getCampaign    = (id, token)   => api.request(`/api/campaigns/${id}`, 'GET', undefined, token);
const createCampaign = (body, token) => api.request('/api/campaigns', 'POST', body, token);
const updateCampaign = (id, body, token) => api.request(`/api/campaigns/${id}`, 'PATCH', body, token);
const deleteCampaign = (id, token)   => api.request(`/api/campaigns/${id}`, 'DELETE', undefined, token);

export default {
  getDefaultCampaign,
  generateCampaign,
  getCampaignSequence,
  loadSavedGame,
  clearSavedGame,
  startRun,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign
};
