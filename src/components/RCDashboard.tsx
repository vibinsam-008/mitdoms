import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, OutpassRequest, HOSTEL_BLOCKS } from '../types';
import { rcReviewOutpass, playNotificationChime } from '../firebase/dbService';
import { PrintableOutpassModal } from './PrintableOutpassModal';
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  MapPin, 
  Calendar, 
  User, 
  Building2, 
  Filter, 
  Check, 
  X, 
  FileText, 
  Smartphone,
  Send,
  AlertCircle,
  Search,
  Bell,
  RefreshCw,
  Zap,
  Volume2,
  VolumeX,
  Radio
} from 'lucide-react';

interface RCDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
  onManualSync?: () => Promise<void>;
  syncLatencyMs?: number;
}

export const RCDashboard: React.FC<RCDashboardProps> = ({ 
  currentUser, 
  requests,
  onManualSync,
  syncLatencyMs = 42
}) => {
  const assignedHostel = currentUser.hostelBlock || 'Marutham';
  const [selectedBlock, setSelectedBlock] = useState<string>(assignedHostel);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DECIDED' | 'ALL'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewRemarks, setReviewRemarks] = useState<{ [outpassId: string]: string }>({});
  const [parentVerifiedMap, setParentVerifiedMap] = useState<{ [outpassId: string]: boolean }>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [selectedForCertificate, setSelectedForCertificate] = useState<OutpassRequest | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newArrivalBanner, setNewArrivalBanner] = useState<OutpassRequest | null>(null);

  // Track previous request IDs to detect real-time arrivals on the RC phone
  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const isInitialMount = useRef(true);

  useEffect(() => {
    const currentPending = requests.filter(r => r.status === 'PENDING_RC');
    const currentPendingIds = new Set(currentPending.map(r => r.outpassId));

    if (!isInitialMount.current) {
      // Find newly arrived outpass that was not in previous set
      const newArrival = currentPending.find(r => !prevPendingIdsRef.current.has(r.outpassId));
      if (newArrival) {
        setNewArrivalBanner(newArrival);
        if (soundEnabled) {
          playNotificationChime();
        }
        // Auto-dismiss banner after 8s
        setTimeout(() => {
          setNewArrivalBanner(null);
        }, 8000);
      }
    } else {
      isInitialMount.current = false;
    }

    prevPendingIdsRef.current = currentPendingIds;
  }, [requests, soundEnabled]);

  // Filter requests
  const filteredRequests = requests.filter(req => {
    if (selectedBlock !== 'ALL' && req.hostelBlock !== selectedBlock) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.studentName.toLowerCase().includes(q);
      const matchReg = req.studentRegNo.toLowerCase().includes(q);
      const matchDest = req.destination.toLowerCase().includes(q);
      const matchId = req.outpassId.toLowerCase().includes(q);
      if (!matchName && !matchReg && !matchDest && !matchId) return false;
    }
    if (activeTab === 'PENDING') {
      return req.status === 'PENDING_RC';
    }
    if (activeTab === 'DECIDED') {
      return req.status !== 'PENDING_RC';
    }
    return true;
  });

  const blockScopedRequests = selectedBlock === 'ALL'
    ? requests
    : requests.filter(r => r.hostelBlock?.toLowerCase() === selectedBlock.toLowerCase());

  const pendingCount = blockScopedRequests.filter(r => r.status === 'PENDING_RC').length;
  const approvedCount = blockScopedRequests.filter(r => ['APPROVED', 'OUT_OF_CAMPUS', 'RETURNED_TO_CAMPUS'].includes(r.status)).length;
  const rejectedCount = blockScopedRequests.filter(r => r.status === 'REJECTED').length;
  const allInmatesCount = blockScopedRequests.length;

  const handleDecision = async (req: OutpassRequest, decision: 'APPROVED' | 'REJECTED') => {
    setActionLoadingId(req.outpassId);
    setActionToast(null);

    const remarks = reviewRemarks[req.outpassId] || (decision === 'APPROVED' ? 'Parent call verified & approved by RC' : 'Declined by RC');
    const isParentVerified = parentVerifiedMap[req.outpassId] ?? (decision === 'APPROVED');

    try {
      await rcReviewOutpass(req.outpassId, decision, remarks, isParentVerified, currentUser);
      setActionToast(
        decision === 'APPROVED'
          ? `✓ Outpass ${req.outpassId} approved! Instantly pushed to Main Gate Security & Hostel Office.`
          : `✗ Outpass ${req.outpassId} declined with remarks recorded.`
      );
      setTimeout(() => setActionToast(null), 5000);
    } catch {
      setActionToast('Failed to update outpass status. Please check connection.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTriggerSync = async () => {
    if (!onManualSync) return;
    setIsManualSyncing(true);
    try {
      await onManualSync();
    } finally {
      setTimeout(() => setIsManualSyncing(false), 400);
    }
  };

  const setPresetRemarks = (outpassId: string, text: string) => {
    setReviewRemarks(prev => ({ ...prev, [outpassId]: text }));
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Real-time Arrival Alert Banner (Pops up with zero latency when student applies) */}
      {newArrivalBanner && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950 via-zinc-900 to-emerald-950 border-2 border-emerald-500 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500 text-zinc-950 flex items-center justify-center font-bold shrink-0 shadow-lg">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700">
                  ⚡ New Application Received (Live)
                </span>
                <span className="text-[11px] font-mono text-zinc-400">{newArrivalBanner.outpassId}</span>
              </div>
              <p className="text-sm font-bold text-white mt-0.5">
                {newArrivalBanner.studentName} ({newArrivalBanner.studentRegNo}) • {newArrivalBanner.destination}
              </p>
              <p className="text-xs text-zinc-300">
                {newArrivalBanner.hostelBlock} Block Rm {newArrivalBanner.roomNumber} • Parent: {newArrivalBanner.parentPhone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => {
                setActiveTab('PENDING');
                setNewArrivalBanner(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow cursor-pointer"
            >
              Review Now
            </button>
            <button
              onClick={() => setNewArrivalBanner(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* RC Mobile-Optimized Top Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {currentUser.name}
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-300">
                  RC Portal
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {currentUser.designation || 'Resident Counsellor • Mobile Inmate Clearance Console'}
              </p>
            </div>
          </div>

          {/* Low-Latency Status Pill & Manual Sync */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-emerald-400">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>Low-Latency Sync: {syncLatencyMs}ms</span>
            </div>

            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                soundEnabled 
                  ? 'bg-zinc-950 border-zinc-800 text-emerald-400 hover:text-emerald-300' 
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
              title={soundEnabled ? 'Chime sound active for new requests' : 'Chime sound muted'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={handleTriggerSync}
              disabled={isManualSyncing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer"
              title="Force check for newly arrived student requests"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{isManualSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Badges (Optimized for phone taps) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-5 pt-4 border-t border-zinc-800">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'PENDING'
                ? 'bg-amber-950/60 border-amber-600/80 shadow-md ring-1 ring-amber-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">Pending Review</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-400">{pendingCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('DECIDED')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'DECIDED'
                ? 'bg-emerald-950/60 border-emerald-600/80 shadow-md ring-1 ring-emerald-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">Approved</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{approvedCount}</span>
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`p-3 rounded-xl border text-center transition-all ${
              activeTab === 'ALL'
                ? 'bg-zinc-800 border-zinc-600 shadow-md ring-1 ring-zinc-500'
                : 'bg-zinc-950/60 border-zinc-800/80 hover:bg-zinc-800/40'
            }`}
          >
            <span className="text-[11px] text-zinc-400 block font-medium">All Inmates</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-zinc-200">{allInmatesCount}</span>
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionToast && (
        <div className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-700 text-emerald-200 text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{actionToast}</span>
          </div>
          <button onClick={() => setActionToast(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Specialized Hostel Database Partition Banner */}
      <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-900 border border-emerald-900/60 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-tight">
                Specialized Database: <span className="text-emerald-400 font-mono font-extrabold">{assignedHostel} Block</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/80">
                Respective RC Queue
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {selectedBlock === assignedHostel 
                ? `Exclusively displaying outpass requests from ${assignedHostel} Block inmates.` 
                : `Viewing campus-wide outpasses. Tap below to filter to your assigned ${assignedHostel} Block.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setSelectedBlock(assignedHostel)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedBlock === assignedHostel
                ? 'bg-emerald-500 text-zinc-950 shadow-md'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            My {assignedHostel} Block
          </button>
          <button
            type="button"
            onClick={() => setSelectedBlock('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedBlock === 'ALL'
                ? 'bg-zinc-200 text-zinc-950 shadow-md'
                : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            All Hostels
          </button>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number, or destination..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-1" />
          <select
            value={selectedBlock}
            onChange={(e) => setSelectedBlock(e.target.value)}
            className="px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
          >
            <option value={assignedHostel}>🏠 {assignedHostel} Block (My Assigned Hostel)</option>
            <option value="ALL">🌐 All Campus Hostels</option>
            <option disabled>──────────</option>
            {HOSTEL_BLOCKS.filter(b => b !== assignedHostel).map(b => (
              <option key={b} value={b}>{b} Block</option>
            ))}
          </select>
        </div>
      </div>

      {/* Requests Stream / Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>
              {activeTab === 'PENDING' ? 'Pending Leave Requests Awaiting Action' :
               activeTab === 'DECIDED' ? 'Processed & Endorsed Outpasses' : 'All Requests'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-300">
              {filteredRequests.length}
            </span>
          </h2>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 animate-pulse">
              <Bell className="w-3 h-3" /> {pendingCount} Pending Clearance
            </span>
          )}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-300">All Cleared! No Pending Applications</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              {activeTab === 'PENDING'
                ? 'There are no pending outpass applications. As soon as a student applies from their phone, it will arrive on this screen within milliseconds with zero latency.'
                : 'No outpasses matched your query.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((req) => {
              const isLoading = actionLoadingId === req.outpassId;
              const isParentVerified = parentVerifiedMap[req.outpassId] ?? false;

              return (
                <div
                  key={req.outpassId}
                  className={`bg-zinc-900 border rounded-2xl p-5 shadow-lg space-y-4 transition-all ${
                    req.status === 'PENDING_RC' ? 'border-amber-900/60 hover:border-amber-700/80 bg-zinc-900/90' : 'border-zinc-800'
                  }`}
                >
                  {/* Top: Student Inmate Identity & Pass ID */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-zinc-200 shrink-0">
                        {req.studentName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white">
                            {req.studentName}
                          </h3>
                          <span className="font-mono text-xs text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                            {req.studentRegNo}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          {req.hostelBlock} Block • Room {req.roomNumber} • {req.branch}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                        {req.outpassId}
                      </span>
                      <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full ${
                        req.status === 'PENDING_RC' ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse' :
                        req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        req.status === 'OUT_OF_CAMPUS' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                        req.status === 'RETURNED_TO_CAMPUS' ? 'bg-zinc-800 text-zinc-300' :
                        'bg-red-950 text-red-300 border border-red-800'
                      }`}>
                        {req.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Mid: Destination, Purpose & Schedule */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Destination</span>
                      <span className="text-sm font-bold text-zinc-100 mt-0.5 block">{req.destination}</span>
                      <span className="text-[11px] text-zinc-400 mt-1 block truncate" title={req.visitAddress}>
                        {req.visitAddress}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                      <span className="text-[10px] text-zinc-500 uppercase font-mono block">Purpose ({req.proposedDays} Days)</span>
                      <p className="text-xs text-zinc-200 mt-0.5 leading-relaxed">{req.purpose}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-1">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase font-mono block">Departure</span>
                        <span className="font-semibold text-zinc-200">{formatDate(req.departureDateTime)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase font-mono block">Expected Return</span>
                        <span className="font-semibold text-zinc-200">{formatDate(req.returnDateTime)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Parental Verification & Call Action */}
                  <div className="p-3 rounded-xl bg-zinc-950/90 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                        <Phone className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <span className="text-[11px] text-zinc-400 block">Parent Phone Contact:</span>
                        <span className="font-mono text-xs sm:text-sm font-bold text-zinc-100">{req.parentPhone}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Direct Phone Dial Button for RC Mobile */}
                      <a
                        href={`tel:${req.parentPhone}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Call Parent Now</span>
                      </a>

                      {/* Parent Call Verified Checkbox */}
                      {req.status === 'PENDING_RC' && (
                        <button
                          type="button"
                          onClick={() => setParentVerifiedMap(prev => ({ ...prev, [req.outpassId]: !isParentVerified }))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isParentVerified
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <Check className={`w-3.5 h-3.5 ${isParentVerified ? 'text-emerald-400' : 'text-zinc-500'}`} />
                          <span>Parent Call: {isParentVerified ? 'Verified' : 'Unverified'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* RC Decision Controls (Only for PENDING_RC) */}
                  {req.status === 'PENDING_RC' ? (
                    <div className="space-y-3 pt-2 border-t border-zinc-800">
                      {/* Preset Remarks */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 uppercase font-mono">Quick Remarks:</span>
                        {[
                          'Parent call verified & approved',
                          'Weekend hometown visit granted',
                          'Emergency clearance endorsed',
                          'Insufficient parental consent'
                        ].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setPresetRemarks(req.outpassId, preset)}
                            className="px-2 py-0.5 rounded text-[11px] bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      {/* Custom Remarks Input */}
                      <input
                        type="text"
                        value={reviewRemarks[req.outpassId] || ''}
                        onChange={(e) => setReviewRemarks({ ...reviewRemarks, [req.outpassId]: e.target.value })}
                        placeholder="Add endorsement remarks or parent conversation note..."
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                      />

                      {/* Accept & Decline Buttons (Touch-friendly for Phone) */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleDecision(req, 'REJECTED')}
                          className="py-3 px-4 rounded-xl bg-red-950/80 hover:bg-red-900/90 text-red-200 font-bold text-xs sm:text-sm border border-red-800/80 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <X className="w-4 h-4 text-red-400" />
                          <span>Decline Leave</span>
                        </button>

                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => handleDecision(req, 'APPROVED')}
                          className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/50"
                        >
                          <Check className="w-4 h-4 text-zinc-950" />
                          <span>Accept & Confirm Outpass</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Already Decided Info */
                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                      <div className="text-zinc-400">
                        {req.rcDecision ? (
                          <span>
                            Decision by <strong className="text-zinc-200">{req.rcDecision.rcName}</strong>: "{req.rcDecision.remarks}"
                          </span>
                        ) : (
                          <span>Processed in system</span>
                        )}
                      </div>

                      <button
                        onClick={() => setSelectedForCertificate(req)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Pass</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Printable Certificate Modal */}
      {selectedForCertificate && (
        <PrintableOutpassModal
          outpass={selectedForCertificate}
          onClose={() => setSelectedForCertificate(null)}
        />
      )}
    </div>
  );
};
