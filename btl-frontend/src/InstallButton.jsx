import { useState, useEffect } from 'react';

const InstallButton = () => {
  const [showButton, setShowButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check multiple ways if app is installed
    const checkIfInstalled = () => {
      // Method 1: Check display mode
      if (window.matchMedia('(display-mode: standalone)').matches) {
        return true;
      }
      
      // Method 2: Check for navigator.standalone (iOS)
      if (window.navigator.standalone) {
        return true;
      }
      
      // Method 3: Check if launched from home screen
      if (window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches) {
        return true;
      }
      
      return false;
    };

    // Check on mount
    setIsInstalled(checkIfInstalled());

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('PWA was installed');
      setIsInstalled(true);
      setShowButton(false);
    });

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e) => {
      console.log('beforeinstallprompt event fired');
      e.preventDefault();
      window.deferredPrompt = e;
      
      // Only show button if not already installed
      if (!checkIfInstalled()) {
        setShowButton(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check on display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e) => {
      setIsInstalled(e.matches);
      if (e.matches) {
        setShowButton(false);
      }
    };
    
    mediaQuery.addListener(handleDisplayModeChange);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
        })
        .catch(err => {
          console.log('Service Worker registration failed:', err);
        });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      mediaQuery.removeListener(handleDisplayModeChange);
    };
  }, []);

  const handleInstall = async () => {
    console.log('Install button clicked');
    
    if (!window.deferredPrompt) {
      console.log('No install prompt available');
      return;
    }

    try {
      window.deferredPrompt.prompt();
      const { outcome } = await window.deferredPrompt.userChoice;
      
      console.log(`User ${outcome} the install`);
      
      if (outcome === 'accepted') {
        console.log('PWA installed successfully');
        setShowButton(false);
        setIsInstalled(true);
      }
      
      window.deferredPrompt = null;
    } catch (error) {
      console.error('Install failed:', error);
    }
  };

  if (isInstalled) {
    return (
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#4CAF50',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '14px',
        zIndex: 9999
      }}>
        ✅ App Installed
      </div>
    );
  }

  if (!showButton) return null;

  return (
    <button
      onClick={handleInstall}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        border: 'none',
        borderRadius: '25px',
        cursor: 'pointer',
        zIndex: 9999,
        fontSize: '16px',
        fontWeight: 'bold',
        boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
        animation: 'pulse 2s infinite'
      }}
    >
      📲 Install App
    </button>
  );
};

export default InstallButton;