import React, { useState, useEffect, useCallback } from 'react';
import { Role, UserProfile, OutpassRequest } from './types';
import { Navbar } from './components/Navbar';
import { WelcomeRoleSelector } from './components/WelcomeRoleSelector';
import { RoleLoginPage } from './components/RoleLoginPage';
import { RoleRegisterPage } from './components/RoleRegisterPage';
import { StudentDashboard } from './components/StudentDashboard';
import { RCDashboard } from './components/RCDashboard';
import { GatekeeperDashboard } from './components/GatekeeperDashboard';
import { EWDashboard } from './components/EWDashboard';
import { HolidayMessModule } from './components/HolidayMessModule';
import { 
  testConnection, 
} from './firebase/config';
import { 
  subscribeToOutpasses, 
  seedInitialDemoData,
  fetchOutpassesFromServer
} from './firebase/dbService';

const SESSION_USER_KEY = 'mit_outpass_session_user';
const SESSION_ROLE_KEY = 'mit_outpass_session_role';

export default function App() {
  const [currentRole, setCurrentRole] = useState<Role | null>(() => {
    return (localStorage.getItem(SESSION_ROLE_KEY) as Role) || null;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeView, setActiveView] = useState<'OUTPASS' | 'HOLIDAY_MESS'>('OUTPASS');
  const [requests, setRequests] = useState<OutpassRequest[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [syncLatencyMs, setSyncLatencyMs] = useState<number>(38);

  const handleManualSync = useCallback(async () => {
    const start = performance.now();
    try {
      const data = await fetchOutpassesFromServer();
      const elapsed = Math.round(performance.now() - start);
      setSyncLatencyMs(Math.max(12, elapsed));
      setRequests(data);
    } catch {
      // Ignore
    }
  }, []);

  // Initialize and Seed Demo Data on boot
  useEffect(() => {
    testConnection();
    seedInitialDemoData();

    // Subscribe to Real-Time Outpass collection with minimum latency
    const unsubscribe = subscribeToOutpasses((data) => {
      setRequests(data);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Save session state to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
      localStorage.setItem(SESSION_ROLE_KEY, currentUser.role);
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
      if (!currentRole) {
        localStorage.removeItem(SESSION_ROLE_KEY);
      }
    }
  }, [currentUser, currentRole]);

  const handleSelectRoleFromWelcome = (role: Role, action: 'login' | 'register') => {
    setCurrentRole(role);
    setAuthMode(action);
    setCurrentUser(null);
  };

  const handleLoginSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
  };

  const handleRegisterSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    setCurrentRole(user.role);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    setAuthMode('login');
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_ROLE_KEY);
  };

  const handleSwitchRole = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    setAuthMode('login');
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_ROLE_KEY);
  };

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'} flex flex-col font-sans transition-colors duration-200`}>
      {/* Top Header */}
      <Navbar
        currentUser={currentUser}
        currentRole={currentRole}
        activeView={activeView}
        onSelectView={setActiveView}
        onLogout={handleLogout}
        onSwitchRole={handleSwitchRole}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Step 1: Welcome Role Selector */}
        {!currentRole && (
          <WelcomeRoleSelector onSelectRole={handleSelectRoleFromWelcome} />
        )}

        {/* Step 2: Login or Register for Selected Role */}
        {currentRole && !currentUser && authMode === 'login' && (
          <RoleLoginPage
            role={currentRole}
            onLoginSuccess={handleLoginSuccess}
            onGoToRegister={() => setAuthMode('register')}
            onBackToRoles={() => setCurrentRole(null)}
          />
        )}

        {currentRole && !currentUser && authMode === 'register' && (
          <RoleRegisterPage
            role={currentRole}
            onRegisterSuccess={handleRegisterSuccess}
            onGoToLogin={() => setAuthMode('login')}
            onBackToRoles={() => setCurrentRole(null)}
          />
        )}

        {/* Step 3: Role-Specific Authenticated Dashboards & Holiday Mess Count */}
        {currentUser && activeView === 'HOLIDAY_MESS' && (
          <HolidayMessModule
            currentUser={currentUser}
            onNavigateToEW={() => setActiveView('OUTPASS')}
          />
        )}

        {currentUser && activeView === 'OUTPASS' && (
          <>
            {currentUser.role === 'STUDENT' && (
              <StudentDashboard currentUser={currentUser} requests={requests} />
            )}

            {currentUser.role === 'RC' && (
              <RCDashboard 
                currentUser={currentUser} 
                requests={requests} 
                onManualSync={handleManualSync}
                syncLatencyMs={syncLatencyMs}
              />
            )}

            {currentUser.role === 'GATEKEEPER' && (
              <GatekeeperDashboard currentUser={currentUser} requests={requests} />
            )}

            {currentUser.role === 'EW' && (
              <EWDashboard 
                currentUser={currentUser} 
                requests={requests}
                onNavigateToHolidayMess={() => setActiveView('HOLIDAY_MESS')}
              />
            )}

            {currentUser.role === 'MESS_STAFF' && (
              <HolidayMessModule currentUser={currentUser} />
            )}
          </>
        )}
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-zinc-800/80 py-4 px-4 sm:px-6 text-center text-xs text-zinc-400 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 Madras Institute of Technology (MIT) Hostels, Anna University. All rights reserved.</p>
          <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
            <span>20-Year Institutional Architecture</span>
            <span>•</span>
            <span>Zero-Duplicate Collision Engine</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
