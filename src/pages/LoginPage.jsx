import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/ModernGameUI.css';

const LoginPage = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="page-bg">
      <div className="auth-container">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            autoFocus
            onChange={e => setEmail(e.target.value)}
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit">Login</button>
          {error && <div className="auth-error">{error}</div>}
        </form>
        <p>
          Don’t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
