import React, { useState } from 'react';
import { UserProfile, OutpassRequest, GATE_LOCATIONS } from '../types';
import { gateLogDeparture, gateLogReturn } from '../firebase/dbService';
import { PrintableOutpassModal } from './PrintableOutpassModal';
import { 
  KeyRound, 
  Search, 
  CheckCircle2, 
  Clock, 
  LogOut, 
  LogIn, 
  AlertTriangle, 
  QrCode, 
  MapPin, 
  Building2, 
  X,
  ShieldAlert,
  ShieldCheck,
  FileText
} from 'lucide-react';

interface GatekeeperDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
}

export const GatekeeperDashboard: React.FC<GatekeeperDashboardProps> = ({ currentUser, requests }) => {
  const [activeTab, setActiveTab] = useState<'DEPARTURES' | 'RETURNS' | 'HISTORY'>('DEPARTURES');
  const [searchQuery, setSearchQuery] = useState('');
  const [securityNote, setSecurityNote] = useState('');
  const [selectedOutpass, setSelectedOutpass] = useState<OutpassRequest | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [selectedForCertificate, setSelectedForCertificate] = useState<OutpassRequest | null>(null);

  // Categorize requests
  const readyToExit = requests.filter(r => r.status === 'APPROVED');
  const currentlyOut = requests.filter(r => r.status === 'OUT_OF_CAMPUS');
  const historyList = requests.filter(r => ['RETURNED_TO_CAMPUS', 'OUT_OF_CAMPUS'].includes(r.status));

  // Filter based on active tab and search
  const getDisplayedList = () => {
    let list: OutpassRequest[] = [];
    if (activeTab === 'DEPARTURES') list = readyToExit;
    else if (activeTab === 'RETURNS') list = currentlyOut;
    else list = historyList;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        r.studentRegNo.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.outpassId.toLowerCase().includes(q) ||
        r.verificationToken.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const displayedList = getDisplayedList();

  const handleLogDeparture = async (req: OutpassRequest) => {
    setActionLoadingId(req.outpassId);
    setActionToast(null);

    try {
      await gateLogDeparture(req.outpassId, currentUser, securityNote || 'Verified at gate post');
      setActionToast({ message: `✓ Campus Departure Logged for ${req.studentName} (${req.studentRegNo}) at ${new Date().toLocaleTimeString('en-IN')}` });
      setSecurityNote('');
      setTimeout(() => setActionToast(null), 5000);
    } catch {
      setActionToast({ message: 'Failed to record gate departure. Please try again.', isError: true });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogReturn = async (req: OutpassRequest) => {
    setActionLoadingId(req.outpassId);
    setActionToast(null);

    try {
      const res = await gateLogReturn(req.outpassId, currentUser, req.returnDateTime, securityNote || undefined);
      if (res.isLate) {
        setActionToast({
          message: `⚠️ Student Return Logged: ${req.studentName} returned LATE past expected curfew. Overdue flag recorded in audit log.`,
          isError: true
        });
      } else {
        setActionToast({
          message: `✓ Inmate Check-In Logged: ${req.studentName} returned on time.`
        });
      }
      setSecurityNote('');
      setTimeout(() => setActionToast(null), 6000);
    } catch {
      setActionToast({ message: 'Failed to record return entry. Please try again.', isError: true });
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const checkIsOverdue = (expectedReturnIso: string) => {
    return Date.now() > new Date(expectedReturnIso).getTime();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Gate Terminal Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-400 shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Main Gate Security Terminal
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950 border border-amber-800 text-amber-300">
                  {currentUser.gateLocation || 'Main Gate (GST Road)'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Guard: {currentUser.name} ({currentUser.uniqueId}) • Live Real-time Outpass Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-emerald-400 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gate Terminal Online</span>
            </span>
          </div>
        </div>

        {/* Quick Tabs for Gatekeeper Workflow */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-5 pt-4 border-t border-zinc-800">
          <button
            onClick={() => setActiveTab('DEPARTURES')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'DEPARTURES'
                ? 'bg-amber-950/60 border-amber-600/80 shadow-md ring-1 ring-amber-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">Ready to Exit Campus</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-400">{readyToExit.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('RETURNS')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'RETURNS'
                ? 'bg-blue-950/60 border-blue-600/80 shadow-md ring-1 ring-blue-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">Currently Outside</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-blue-400">{currentlyOut.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'HISTORY'
                ? 'bg-zinc-800 border-zinc-600 shadow-md ring-1 ring-zinc-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">Gate Logs Today</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-zinc-200">{historyList.length}</span>
          </button>
        </div>
      </div>

      {/* Action Toast */}
      {actionToast && (
        <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between shadow-xl ${
          actionToast.isError ? 'bg-red-950/90 border-red-700 text-red-200' : 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2">
            {actionToast.isError ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span className="font-semibold">{actionToast.message}</span>
          </div>
          <button onClick={() => setActionToast(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Instant Search Bar */}
      <div className="bg-zinc-900/70 p-3 rounded-xl border border-zinc-800 flex items-center gap-3">
        <Search className="w-5 h-5 text-zinc-400 shrink-0 ml-1" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by student register number, name, outpass ID, or QR code token..."
          className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-xs text-zinc-400 hover:text-white px-2">
            Clear
          </button>
        )}
      </div>

      {/* Inmate Clearance List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>
              {activeTab === 'DEPARTURES' ? 'Approved Outpasses (Students Ready to Leave)' :
               activeTab === 'RETURNS' ? 'Inmates Outside Campus (Awaiting Return)' : 'Gate Movement Log'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
              {displayedList.length}
            </span>
          </h2>
        </div>

        {displayedList.length === 0 ? (
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-300">No Records Found</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'DEPARTURES' ? 'No students currently have approved passes awaiting departure.' :
               activeTab === 'RETURNS' ? 'No students are currently logged as out of campus.' : 'No movement logged yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedList.map((req) => {
              const isLoading = actionLoadingId === req.outpassId;
              const isOverdue = checkIsOverdue(req.returnDateTime);

              return (
                <div
                  key={req.outpassId}
                  className={`bg-zinc-900 border rounded-2xl p-5 shadow-lg space-y-4 ${
                    isOverdue && req.status === 'OUT_OF_CAMPUS' ? 'border-red-800/80 bg-red-950/20' : 'border-zinc-800'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                          {req.studentRegNo}
                        </span>
                        <span className="font-mono text-xs text-zinc-400">{req.outpassId}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1">{req.studentName}</h3>
                      <p className="text-xs text-zinc-400">
                        {req.hostelBlock} Block • Room {req.roomNumber} • {req.branch}
                      </p>
                    </div>

                    <div className="text-right">
                      {isOverdue && req.status === 'OUT_OF_CAMPUS' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-red-950 text-red-300 border border-red-800 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> OVERDUE
                        </span>
                      ) : (
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-mono font-bold ${
                          req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          req.status === 'OUT_OF_CAMPUS' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                          'bg-zinc-800 text-zinc-300'
                        }`}>
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Destination & Purpose */}
                  <div className="text-xs space-y-1">
                    <p className="text-zinc-300">
                      <span className="text-zinc-500 font-medium">Destination: </span>
                      <strong className="text-white">{req.destination}</strong>
                    </p>
                    <p className="text-zinc-400 truncate">
                      <span className="text-zinc-500">Purpose: </span>
                      {req.purpose}
                    </p>
                  </div>

                  {/* Schedule */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Departure</span>
                      <span className="font-semibold text-zinc-200">{formatDate(req.departureDateTime)}</span>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${
                      isOverdue && req.status === 'OUT_OF_CAMPUS' ? 'bg-red-950/40 border-red-800' : 'bg-zinc-950 border-zinc-800/80'
                    }`}>
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Expected Return</span>
                      <span className={`font-semibold ${isOverdue && req.status === 'OUT_OF_CAMPUS' ? 'text-red-400' : 'text-zinc-200'}`}>
                        {formatDate(req.returnDateTime)}
                      </span>
                    </div>
                  </div>

                  {/* Gatekeeper Actions */}
                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-3">
                    <button
                      onClick={() => setSelectedForCertificate(req)}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-800"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Inspect QR</span>
                    </button>

                    {req.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleLogDeparture(req)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Log Departure (Exit Campus)</span>
                      </button>
                    )}

                    {req.status === 'OUT_OF_CAMPUS' && (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleLogReturn(req)}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Log Return (Check-In Campus)</span>
                      </button>
                    )}

                    {req.status === 'RETURNED_TO_CAMPUS' && (
                      <span className="text-xs text-zinc-400 font-mono">
                        Returned: {req.gateLogs?.returnedAt ? formatDate(req.gateLogs.returnedAt) : 'Logged'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QR Certificate Modal */}
      {selectedForCertificate && (
        <PrintableOutpassModal
          outpass={selectedForCertificate}
          onClose={() => setSelectedForCertificate(null)}
        />
      )}
    </div>
  );
};
