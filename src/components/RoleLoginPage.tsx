import React, { useState } from 'react';
import { Role, UserProfile } from '../types';
import { loginUser } from '../firebase/dbService';
import { 
  GraduationCap, 
  ShieldCheck, 
  Building2, 
  KeyRound, 
  ArrowLeft, 
  LogIn, 
  AlertCircle, 
  Eye, 
  EyeOff,
  UserPlus,
  Sparkles,
  Utensils
} from 'lucide-react';

interface RoleLoginPageProps {
  role: Role;
  onLoginSuccess: (user: UserProfile) => void;
  onGoToRegister: () => void;
  onBackToRoles: () => void;
}

export const RoleLoginPage: React.FC<RoleLoginPageProps> = ({
  role,
  onLoginSuccess,
  onGoToRegister,
  onBackToRoles
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getRoleDetails = () => {
    switch (role) {
      case 'STUDENT':
        return {
          title: 'Student Inmate Login',
          subtitle: 'Madras Institute of Technology Hostel Resident Portal',
          idLabel: 'Register Number / Roll No',
          idPlaceholder: 'e.g., 2022506042 or 2023504018',
          icon: GraduationCap,
          accentColor: 'text-zinc-100',
          demoAccount: { id: '2022506042', name: 'K. Vigneshwaran (III Year AI&DS)' }
        };
      case 'RC':
        return {
          title: 'Resident Counsellor (RC) Login',
          subtitle: 'Hostel Block Leave Endorsement & Parent Call Verification',
          idLabel: 'Resident Counsellor Staff ID',
          idPlaceholder: 'e.g., RC-MANICKAM',
          icon: ShieldCheck,
          accentColor: 'text-emerald-400',
          demoAccount: { id: 'RC-MANICKAM', name: 'Dr. R. Manickam (RC)' }
        };
      case 'EW':
        return {
          title: 'Executive Warden (EW) Login',
          subtitle: 'Hostel Central Office Administration & 20-Year Archive',
          idLabel: 'Executive Warden ID / Email',
          idPlaceholder: 'e.g., EW-WARDEN-01 or ew.warden@mitindia.edu',
          icon: Building2,
          accentColor: 'text-blue-400',
          demoAccount: { id: 'EW-WARDEN-01', name: 'Prof. Dr. S. K. Sundaramoorthy (EW)' }
        };
      case 'GATEKEEPER':
        return {
          title: 'Main Gate Security Login',
          subtitle: 'Campus Outpass QR Verification & Movement Timestamp Logging',
          idLabel: 'Security Guard / Badge ID',
          idPlaceholder: 'e.g., SEC-GATE-01',
          icon: KeyRound,
          accentColor: 'text-amber-400',
          demoAccount: { id: 'SEC-GATE-01', name: 'M. Selvam (Main Gate Post)' }
        };
      case 'MESS_STAFF':
        return {
          title: 'Hostel Mess Supervisor Login',
          subtitle: 'Holiday Catering Planning & Kitchen Headcount Operations',
          idLabel: 'Mess Supervisor Staff ID / Email',
          idPlaceholder: 'e.g., MESS-CHEF-01 or mess.supervisor@mitindia.edu',
          icon: Utensils,
          accentColor: 'text-amber-400',
          demoAccount: { id: 'MESS-CHEF-01', name: 'K. Arumugam (Mess Supervisor)' }
        };
    }
  };

  const details = getRoleDetails();
  const Icon = details.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setErrorMessage(`Please enter your ${details.idLabel}.`);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginUser(role, identifier, password || undefined);
      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.error || 'Authentication failed. Please check credentials.');
      }
    } catch {
      setErrorMessage('Network or authorization error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillDemo = () => {
    setIdentifier(details.demoAccount.id);
    setPassword('password123');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Back navigation */}
        <button
          onClick={onBackToRoles}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-6 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Role Selection</span>
        </button>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Top header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-md mb-3">
              <Icon className={`w-7 h-7 ${details.accentColor}`} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {details.title}
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              {details.subtitle}
            </p>
          </div>

          {/* Quick Demo Fill Button */}
          <div className="mb-5 p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 flex items-center justify-between">
            <div className="text-left">
              <p className="text-[11px] font-mono text-zinc-400">Quick Test Credential</p>
              <p className="text-xs font-semibold text-zinc-200">{details.demoAccount.name}</p>
            </div>
            <button
              type="button"
              onClick={handleFillDemo}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors border border-zinc-700"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Fill Demo</span>
            </button>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                {details.idLabel} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={details.idPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all font-mono"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Password <span className="text-red-400">*</span>
                </label>
                <span className="text-[10px] text-zinc-400 font-mono">Demo: password123</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-md cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to {role} Dashboard</span>
                </>
              )}
            </button>
          </form>

          {/* Prominent Redirecting link for Registration */}
          <div className="mt-6 pt-5 border-t border-zinc-800 text-center">
            <p className="text-xs text-zinc-400">
              Don't have an account registered yet?
            </p>
            <button
              type="button"
              onClick={onGoToRegister}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register new {role} account with ID verification →</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
