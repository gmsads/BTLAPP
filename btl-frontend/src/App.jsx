import React, { useState, useEffect } from 'react';
import HomePage from './components/HomePage';
import ExecutiveDashboard from './components/ExecutiveDashboard';
import AdminDashboard from './components/AdminDashbaord';
import CustomerDashboard from './components/ClientDashboard';
import OwnerDashboard from './components/OwnerDashboard';
import axios from './utils/api';
import PWAInstallPrompt from './components/PWAInstallPrompt';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (token && savedUser) {
      try {
        const response = await axios.get('/auth/me');
        setUser(response.data.user);
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  };

  // Handle role-based URL redirects and security guards
  useEffect(() => {
    if (loading) return;

    const path = window.location.pathname;

    if (!user) {
      // Force non-logged-in users to /login
      if (path !== '/' && path !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    } else {
      // Role guards
      if (user.role === 'admin') {
        if (!path.startsWith('/admin')) {
          window.history.replaceState(null, '', '/admin/dashboard');
        }
      } else if (user.role === 'owner') {
        if (!path.startsWith('/owner')) {
          window.history.replaceState(null, '', '/owner/dashboard');
        }
      } else if (user.role === 'client') {
        if (!path.startsWith('/client')) {
          window.history.replaceState(null, '', '/client/dashboard');
        }
      } else {
        // worker / executive
        if (!path.startsWith('/worker')) {
          window.history.replaceState(null, '', '/worker/dashboard');
        }
      }
    }
  }, [user, loading]);

  const handleLogin = (userData) => {
    setUser(userData);
    if (userData.role === 'admin') {
      window.history.pushState(null, '', '/admin/dashboard');
    } else if (userData.role === 'owner') {
      window.history.pushState(null, '', '/owner/dashboard');
    } else if (userData.role === 'client') {
      window.history.pushState(null, '', '/client/dashboard');
    } else {
      window.history.pushState(null, '', '/worker/dashboard');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.history.pushState(null, '', '/login');
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        Loading...
      </div>
    );
  }

  return (
     <div className="App">
      {user ? (
        user.role === 'admin' ? (
          <AdminDashboard user={user} onLogout={handleLogout} />
        ) : user.role === 'owner' ? ( // LINE 78: Added this condition
          <OwnerDashboard user={user} onLogout={handleLogout} />
        ) : user.role === 'client' ? (
          <CustomerDashboard user={user} onLogout={handleLogout} />
        ) : (
          <ExecutiveDashboard user={user} onLogout={handleLogout} />
        )
      ) : (
        <HomePage onLogin={handleLogin} />
      )}
      <PWAInstallPrompt />
    </div>
  );
}

export default App;