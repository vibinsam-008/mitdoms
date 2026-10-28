import React from 'react';
import { Role } from '../types';
import { 
  GraduationCap, 
  ShieldCheck, 
  Building2, 
  KeyRound, 
  ArrowRight, 
  Smartphone, 
  CheckCircle2, 
  Database,
  Lock,
  Clock,
  Utensils
} from 'lucide-react';

interface WelcomeRoleSelectorProps {
  onSelectRole: (role: Role, action: 'login' | 'register') => void;
}

export const WelcomeRoleSelector: React.FC<WelcomeRoleSelectorProps> = ({ onSelectRole }) => {
  const rolesConfig: Array<{
    role: Role;
    title: string;
    subtitle: string;
    badge: string;
    description: string;
    icon: React.ElementType;
    highlights: string[];
    bgAccent: string;
    borderAccent: string;
    textColor: string;
  }> = [
    {
      role: 'STUDENT',
      title: 'Student Inmate',
      subtitle: 'Hostel Resident Portal',
      badge: 'Mobile Optimized',
      description: 'Apply for home/emergency digital outpass on your smartphone. Track approval in real-time and display digital QR pass.',
      icon: GraduationCap,
      highlights: [
        'Instant outpass submission from phone',
        'Live status tracking (Pending → Approved)',
        'Digital QR code pass for gate clearance'
      ],
      bgAccent: 'group-hover:border-zinc-500 bg-zinc-900/60',
      borderAccent: 'border-zinc-800',
      textColor: 'text-zinc-100'
    },
    {
      role: 'RC',
      title: 'Resident Counsellor (RC)',
      subtitle: 'Hostel Block Clearance',
      badge: 'Cross-Device Management',
      description: 'Seamlessly review student outpass requests on your phone or desktop. Verify parent contacts and 1-tap accept/decline.',
      icon: ShieldCheck,
      highlights: [
        'Live phone queue for pending block requests',
        'Direct 1-tap parent contact verification',
        'Instant sync to Gatekeeper and Hostel Office'
      ],
      bgAccent: 'group-hover:border-emerald-600/70 bg-zinc-900/60',
      borderAccent: 'border-zinc-800',
      textColor: 'text-emerald-400'
    },
    {
      role: 'GATEKEEPER',
      title: 'Gatekeeper (Security)',
      subtitle: 'Main & Campus Gates',
      badge: 'Real-Time Clearance',
      description: 'Check student QR passes, log campus departure times, and register returns with automatic overdue curfew detection.',
      icon: KeyRound,
      highlights: [
        'Fast QR pass verification terminal',
        '1-tap departure and return logging',
        'Automated overdue & curfew alerts'
      ],
      bgAccent: 'group-hover:border-amber-600/70 bg-zinc-900/60',
      borderAccent: 'border-zinc-800',
      textColor: 'text-amber-400'
    },
    {
      role: 'EW',
      title: 'Executive Warden (EW)',
      subtitle: 'Hostel Office Oversight',
      badge: '20-Year Institutional Archive',
      description: 'Central campus outpass command. Monitor real-time inmate movement, block statistics, and access 20-year audit records.',
      icon: Building2,
      highlights: [
        'Live campus inmate movement analytics',
        '20-year archival records & CSV export',
        'Tamper-proof security audit log'
      ],
      bgAccent: 'group-hover:border-blue-600/70 bg-zinc-900/60',
      borderAccent: 'border-zinc-800',
      textColor: 'text-blue-400'
    },
    {
      role: 'MESS_STAFF',
      title: 'Mess Supervisor',
      subtitle: 'Holiday Catering Planning',
      badge: 'Zero Food Wastage',
      description: 'Access aggregate daily meal projections, hostel block dining breakdown, and track student holiday presence declarations.',
      icon: Utensils,
      highlights: [
        'Daily breakfast, lunch, dinner estimates',
        'Hostel block occupancy breakdown',
        'Non-respondents tracking & CSV export'
      ],
      bgAccent: 'group-hover:border-amber-600/70 bg-zinc-900/60',
      borderAccent: 'border-zinc-800',
      textColor: 'text-amber-400'
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Top Institutional Header */}
      <div className="text-center max-w-3xl mx-auto pt-2 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono mb-4">
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span>Cloud-Synced Firebase Outpass Architecture</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          Madras Institute of Technology
        </h1>
        <p className="text-sm sm:text-lg text-zinc-400 mt-1 font-medium">
          Anna University • Hostels Digital Outpass System
        </p>
        <p className="text-xs sm:text-sm text-zinc-400 mt-3 max-w-2xl mx-auto">
          Please select your institutional role to proceed. Each role features dedicated login and registration portals with strict unique ID duplicate prevention and real-time cross-device synchronization.
        </p>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 my-4">
        {rolesConfig.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.role}
              className={`group relative rounded-xl border ${item.borderAccent} ${item.bgAccent} p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-zinc-950/50 hover:-translate-y-0.5`}
            >
              <div>
                {/* Header Icon + Role Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-inner group-hover:border-zinc-700 transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                    {item.badge}
                  </span>
                </div>

                {/* Titles */}
                <h3 className="text-lg font-bold text-white group-hover:text-zinc-100 transition-colors">
                  {item.title}
                </h3>
                <p className={`text-xs font-medium ${item.textColor} mb-3`}>
                  {item.subtitle}
                </p>

                {/* Description */}
                <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                  {item.description}
                </p>

                {/* Highlights */}
                <ul className="space-y-2 mb-6">
                  {item.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                <button
                  onClick={() => onSelectRole(item.role, 'login')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors shadow-sm"
                >
                  <span>Login as {item.role}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onSelectRole(item.role, 'register')}
                  className="w-full text-center py-2 px-3 rounded-lg bg-transparent hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors border border-zinc-800 hover:border-zinc-700"
                >
                  Register New {item.title}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Institutional Assurance Footer */}
      <div className="border-t border-zinc-800/80 pt-6 mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60">
            <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-zinc-200">Cross-Device Seamless Workflow</p>
              <p className="text-[11px] text-zinc-400">RC reviews on phone while students apply on phone</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-3 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60">
            <Lock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-zinc-200">Duplicate ID Prevention</p>
              <p className="text-[11px] text-zinc-400">Strict unique ID collision check on Firestore</p>
            </div>
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-3 p-3 rounded-lg bg-zinc-900/30 border border-zinc-800/60">
            <Clock className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-zinc-200">20-Year Institutional Preservation</p>
              <p className="text-[11px] text-zinc-400">Academic year partitioned & immutable audit trail</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
