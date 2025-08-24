// src/App.jsx
import React from 'react';
import AppRouter from './AppRouter';
import { AuthProvider } from './contexts/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
