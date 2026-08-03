import React, { useState } from 'react';
import AuthScreen from './components/AuthScreen';
import AppLayout from './components/AppLayout';
import OrchardMap from './components/OrchardMap';
import HarvestAnalytics from './components/HarvestAnalytics';
import NodeManagement from './components/NodeManagement';
import DashboardHome from './components/DashboardHome';
import Settings from './components/Settings';


export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'map' | 'nodes'

  if (!isAuthenticated) {
    return <AuthScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <AppLayout 
      currentView={currentView} 
      setCurrentView={setCurrentView}
      onLogout={() => setIsAuthenticated(false)}
    >
      {currentView === 'dashboard' && <DashboardHome />}
      {currentView === 'analytics' && <HarvestAnalytics />}
      {currentView === 'map' && <OrchardMap />}
      {currentView === 'nodes' && <NodeManagement />}
      {currentView === 'settings' && <Settings />}
      
    </AppLayout>
  );
}