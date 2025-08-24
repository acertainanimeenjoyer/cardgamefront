import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import auth from '../services/authService';
import '../styles/ModernGameUI.css';

const RegisterPage = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState(''); // optional
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await auth.register({ email, password, username: displayName || undefined });
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err?.message || 'Registration failed');
    }
  };

  return (
    <div className="page-bg">
      <div className="auth-container">
        <h2>Register</h2>
        <form onSubmit={handleSubmit}>
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={e => setEmail(e.target.value)}
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={displayName}
            autoComplete="nickname"
            onChange={e => setDisplayName(e.target.value)}
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={password}
            autoComplete="new-password"
            onChange={e => setPassword(e.target.value)}
          />
          <button type="submit">Register</button>
          {error && <div className="auth-error">{error}</div>}
        </form>
        <p>Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
};

export default RegisterPage;
