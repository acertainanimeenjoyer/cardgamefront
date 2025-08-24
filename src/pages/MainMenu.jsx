//pages/MainMenu.jsx
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/ModernGameUI.css';

const MainMenu = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  return (
    <div className="page-bg menu-bg">
      <div className="main-menu">
        <h2>Welcome, {user?.username || 'noname'}!</h2>
        <div className="menu-buttons">
          <button onClick={() => navigate('/campaigns')}>Campaign</button>
          <button onClick={() => navigate('/edit')}>Editor Menu</button>
          <button onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
