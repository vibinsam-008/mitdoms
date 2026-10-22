import React from 'react';
import { UserProfile, Role } from '../types';
import { 
  Building2, 
  GraduationCap, 
  ShieldCheck, 
  KeyRound, 
  LogOut, 
  Sun, 
  Moon, 
  Wifi,
  Smartphone
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  currentRole: Role | null;
  onLogout: () => void;
  onSwitchRole: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentRole,
  onLogout,
  onSwitchRole,
  isDarkMode,
  onToggleTheme
}) => {
  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'STUDENT':
        return { label: 'Student Inmate', icon: GraduationCap, bg: 'bg-zinc-800 text-zinc-200 border-zinc-700' };
      case 'RC':
        return { label: 'Resident Counsellor', icon: ShieldCheck, bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60' };
      case 'EW':
        return { label: 'Executive Warden', icon: Building2, bg: 'bg-blue-950/80 text-blue-300 border-blue-800/60' };
      case 'GATEKEEPER':
        return { label: 'Security Gatekeeper', icon: KeyRound, bg: 'bg-amber-950/80 text-amber-300 border-amber-800/60' };
    }
  };

  const badge = currentRole ? getRoleBadge(currentRole) : null;
  const BadgeIcon = badge?.icon;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Emblem */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={onSwitchRole}>
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center font-mono font-bold text-lg text-zinc-100 shadow-sm">
              MIT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base tracking-tight text-white">
                  MIT Hostel Digital Outpass
                </span>
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
                  <Wifi className="w-3 h-3 animate-pulse" /> Live Cloud Sync
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Anna University • Chromepet, Chennai
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {badge && (
              <div className={`hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${badge.bg}`}>
                {BadgeIcon && <BadgeIcon className="w-3.5 h-3.5" />}
                <span>{badge.label}</span>
              </div>
            )}

            {currentUser && (
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-zinc-200 truncate max-w-[140px] md:max-w-[180px]">
                  {currentUser.name}
                </p>
                <p className="text-[10px] font-mono text-zinc-400">
                  {currentUser.uniqueId}
                </p>
              </div>
            )}

            {/* Mobile cross-device hint badge */}
            <div className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-400 border border-zinc-800 px-2 py-1 rounded bg-zinc-900/60">
              <Smartphone className="w-3 h-3 text-zinc-300" />
              <span>Mobile-First Sync</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Switch Role / Logout */}
            {currentRole ? (
              <button
                onClick={onSwitchRole}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                title="Switch Portal / Role"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Switch Portal</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};
