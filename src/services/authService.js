// src/services/authService.js
import api from './apiService';

// simple email test (enough for client-side gating)
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// normalize legacy creds to email-first payloads
function toEmailPayload(creds = {}, { requireEmail = true } = {}) {
  const rawEmail = creds.email ?? creds.username; // tolerate legacy "username" input
  const email = (rawEmail || '').trim().toLowerCase();
  const password = (creds.password || '').trim();
  const username = (creds.username && !isEmail(creds.username)) ? creds.username.trim() : undefined;

  if (requireEmail && !isEmail(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password) {
    throw new Error('Password is required.');
  }
  // username stays optional (display name); backend ignores if undefined
  return { email, password, ...(username ? { username } : {}) };
}

const login = async (creds) => {
  const payload = toEmailPayload(creds);
  return api.request('/api/auth/login', 'POST', payload);
};

const register = async (creds) => {
  // allow optional display name in register
  const payload = toEmailPayload(creds);
  return api.request('/api/auth/register', 'POST', payload);
};

const getMe = (token) => api.request('/api/auth/me', 'GET', undefined, token);

export default { login, register, getMe };
