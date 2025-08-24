import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MainMenu from './pages/MainMenu';
import GamePage from './pages/GamePage';
import LootRoom from './rooms/LootRoom';
import MerchantRoom from './rooms/MerchantRoom';
import EventRoom from './rooms/EventRoom';
import CardEditor from './editors/CardEditor';
import { AuthContext } from './contexts/AuthContext';
import RunManager from './run/RunManager';
import CampaignSelect from './pages/CampaignSelect';
import EditorMenu from './pages/EditorMenu';
import CampaignEditor from './editors/CampaignEditor';
import EnemyEditor from './editors/EnemyEditor';
import Continue from './pages/Continue';
import ContinueGuard from './routes/ContinueGuard';

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { token } = useContext(AuthContext);
  return token ? children : <Navigate to="/login" replace />;
};

// Run route wrapper for params → props
function RunRoute() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  return (
    <RunManager
      campaignId={campaignId}
      mode="sequence"
      onEnterCombat={(payload) => {
        // payload may be { current, campaignId } or a room doc
        const r = payload?.current || payload;
        const campId = payload?.campaignId || campaignId;
        // allow one guarded hop into the run without showing /continue
        sessionStorage.setItem('allowRunOnce', '1');
        navigate('/game', { state: { room: r, campaignId: campId } });
      }}
      onExitRun={() => navigate('/')}
    />
  );
}

const AppRouter = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainMenu />
          </ProtectedRoute>
        }
      />
      {/* Anything that represents "being inside a run" is wrapped by ContinueGuard */}
      <Route
        element={
          <ProtectedRoute>
            <ContinueGuard />
          </ProtectedRoute>
        }
      >
        <Route path="/run/:campaignId" element={<RunRoute />} />
        <Route path="/game" element={<GamePage />} />
      </Route>
      <Route
        path="/loot"
        element={
          <ProtectedRoute>
            <LootRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path="/merchant"
        element={
          <ProtectedRoute>
            <MerchantRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path="/event"
        element={
          <ProtectedRoute>
            <EventRoom />
          </ProtectedRoute>
        }
      />
      {/* Existing single Card Editor route (kept for backward compat) */}
      <Route
        path="/editor"
        element={
          <ProtectedRoute>
            <CardEditor />
          </ProtectedRoute>
        }
      />

      {/* NEW: Editor Menu + sub-editors */}
      <Route
        path="/edit"
        element={
          <ProtectedRoute>
            <EditorMenu />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edit/cards"
        element={
          <ProtectedRoute>
            <CardEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edit/enemies"
        element={
          <ProtectedRoute>
            <EnemyEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/edit/campaigns"
        element={
          <ProtectedRoute>
            <CampaignEditor />
          </ProtectedRoute>
        }
      />

      <Route
        path="/campaigns"
        element={
          <ProtectedRoute>
            <CampaignSelect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/continue"
        element={
          <ProtectedRoute>
            <Continue />
          </ProtectedRoute>
        }
      />
      {/* Catch-all: redirect to / */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default AppRouter;
