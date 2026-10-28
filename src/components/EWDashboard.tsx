import React, { useState, useEffect, useMemo } from 'react';
import { 
  UserProfile, 
  OutpassRequest, 
  AuditLogEntry, 
  HOSTEL_BLOCKS, 
  COMMON_DISEASES,
  OutpassCategory,
  OutpassStatus,
  isNativePlaceRequest,
  isApprovedMedicalRequest,
  OperationalSanitationRecord
} from '../types';
import { 
  getAuditLogs, 
  getAcademicYear, 
  ewEndorseOutpass,
  getEWSummaryStats,
  getSanitizedOperationalSanitationRecords,
  BASELINE_BLOCK_CAPACITIES,
  TOTAL_CAMPUS_CAPACITY
} from '../firebase/dbService';
import { PrintableOutpassModal } from './PrintableOutpassModal';
import { 
  Building2, 
  Users, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Download, 
  Search, 
  Filter, 
  FileText, 
  ShieldCheck, 
  Calendar,
  Layers,
  History,
  RefreshCw,
  HeartPulse,
  Activity,
  Stethoscope,
  XCircle,
  UserCheck,
  ChevronRight,
  ArrowUpRight,
  AlertCircle,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  Home,
  Check,
  X,
  Eye,
  Lock
} from 'lucide-react';

interface EWDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
  onNavigateToHolidayMess?: () => void;
}

type DrillDownTarget = 'NATIVE_ALL' | 'NATIVE_AWAY' | 'NATIVE_APPROVED' | 'NATIVE_RETURNED' |
                       'MEDICAL_ALL' | 'MEDICAL_AWAY' | 'MEDICAL_APPROVED' | 'MEDICAL_RETURNED' |
                       'STATUS_ALL' | 'STATUS_PRESENT' | 'STATUS_AWAY' | 'STATUS_UNUSED' | 'STATUS_UNVERIFIED' | null;

export const EWDashboard: React.FC<EWDashboardProps> = ({ currentUser, requests, onNavigateToHolidayMess }) => {
  const currentAcademicYear = getAcademicYear();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(currentAcademicYear);
  const [activeTab, setActiveTab] = useState<'EXECUTIVE_SUMMARY' | 'OPERATIONAL_SANITE' | 'CLINICAL_REGISTER' | 'MASTER_ROSTER' | 'AUDIT_LOGS'>('EXECUTIVE_SUMMARY');
  
  // Comprehensive Filters (Requirement 3)
  const [selectedBlock, setSelectedBlock] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedRC, setSelectedRC] = useState<string>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drill-down Modal State
  const [drillDownTarget, setDrillDownTarget] = useState<DrillDownTarget>(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  // Inspection & Modals
  const [selectedForPrint, setSelectedForPrint] = useState<OutpassRequest | null>(null);
  const [sanctioningOutpass, setSanctioningOutpass] = useState<OutpassRequest | null>(null);
  const [wardenRemarks, setWardenRemarks] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [inspectBlock, setInspectBlock] = useState<string | null>(null);

  // Load audit logs when tab is selected
  useEffect(() => {
    if (activeTab === 'AUDIT_LOGS') {
      setIsLoadingLogs(true);
      getAuditLogs()
        .then(logs => setAuditLogs(logs))
        .finally(() => setIsLoadingLogs(false));
    }
  }, [activeTab]);

  // Compute Server-synchronized EW Statistics
  const ewStats = useMemo(() => {
    return getEWSummaryStats(requests, selectedBlock, {
      start: startDateFilter ? `${startDateFilter}T00:00:00.000Z` : undefined,
      end: endDateFilter ? `${endDateFilter}T23:59:59.999Z` : undefined
    });
  }, [requests, selectedBlock, startDateFilter, endDateFilter]);

  // Filtered requests based on all active filters
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // Academic year
      if (selectedAcademicYear && req.academicYear && req.academicYear !== selectedAcademicYear) {
        if (selectedAcademicYear !== currentAcademicYear) return false;
      }
      // Hostel Block
      if (selectedBlock !== 'ALL' && req.hostelBlock !== selectedBlock) return false;
      // Status
      if (selectedStatus !== 'ALL' && req.status !== selectedStatus) return false;
      // Category
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'NATIVE' && !isNativePlaceRequest(req)) return false;
        if (selectedCategory === 'MEDICAL' && !isApprovedMedicalRequest(req)) return false;
        if (selectedCategory !== 'NATIVE' && selectedCategory !== 'MEDICAL' && req.category !== selectedCategory) return false;
      }
      // RC Filter
      if (selectedRC !== 'ALL') {
        const rcName = req.rcDecision?.rcName || '';
        const rcId = req.rcDecision?.rcId || '';
        if (!rcName.toLowerCase().includes(selectedRC.toLowerCase()) && !rcId.toLowerCase().includes(selectedRC.toLowerCase())) {
          return false;
        }
      }
      // Date Range
      if (startDateFilter) {
        const s = new Date(startDateFilter).getTime();
        if (new Date(req.departureDateTime).getTime() < s) return false;
      }
      if (endDateFilter) {
        const e = new Date(endDateFilter).getTime() + 86400000;
        if (new Date(req.departureDateTime).getTime() > e) return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mName = req.studentName.toLowerCase().includes(q);
        const mReg = req.studentRegNo.toLowerCase().includes(q);
        const mDest = req.destination.toLowerCase().includes(q);
        const mId = req.outpassId.toLowerCase().includes(q);
        const mRoom = req.roomNumber.toLowerCase().includes(q);
        if (!mName && !mReg && !mDest && !mId && !mRoom) return false;
      }
      return true;
    });
  }, [requests, selectedAcademicYear, currentAcademicYear, selectedBlock, selectedStatus, selectedCategory, selectedRC, startDateFilter, endDateFilter, searchQuery]);

  // Privacy-sanitized operational sanitation records (NO medical diagnoses)
  const operationalSanitationRecords = useMemo(() => {
    return getSanitizedOperationalSanitationRecords(filteredRequests, selectedBlock);
  }, [filteredRequests, selectedBlock]);

  // Contributing records for current Drill-Down Modal
  const drillDownRecords = useMemo(() => {
    if (!drillDownTarget) return [];

    switch (drillDownTarget) {
      // Native Place
      case 'NATIVE_ALL':
        return filteredRequests.filter(r => isNativePlaceRequest(r));
      case 'NATIVE_APPROVED':
        return filteredRequests.filter(r => isNativePlaceRequest(r) && r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt));
      case 'NATIVE_AWAY':
        return filteredRequests.filter(r => isNativePlaceRequest(r) && r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt));
      case 'NATIVE_RETURNED':
        return filteredRequests.filter(r => isNativePlaceRequest(r) && r.status === 'RETURNED_TO_CAMPUS');

      // Medical Leave (Operational)
      case 'MEDICAL_ALL':
        return filteredRequests.filter(r => isApprovedMedicalRequest(r));
      case 'MEDICAL_APPROVED':
        return filteredRequests.filter(r => isApprovedMedicalRequest(r) && r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt));
      case 'MEDICAL_AWAY':
        return filteredRequests.filter(r => isApprovedMedicalRequest(r) && r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt));
      case 'MEDICAL_RETURNED':
        return filteredRequests.filter(r => isApprovedMedicalRequest(r) && r.status === 'RETURNED_TO_CAMPUS');

      // Hostel Status
      case 'STATUS_ALL':
        return filteredRequests;
      case 'STATUS_AWAY':
        return filteredRequests.filter(r => r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt));
      case 'STATUS_UNUSED':
        return filteredRequests.filter(r => r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt));
      case 'STATUS_PRESENT':
        return filteredRequests.filter(r => r.status !== 'OUT_OF_CAMPUS');
      case 'STATUS_UNVERIFIED':
        return filteredRequests.filter(r => r.status === 'PENDING_RC' || (r.status === 'OUT_OF_CAMPUS' && !r.gateLogs?.departedAt));
      default:
        return [];
    }
  }, [drillDownTarget, filteredRequests]);

  const handleExecuteSanction = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!sanctioningOutpass) return;
    setIsSubmittingDecision(true);
    try {
      await ewEndorseOutpass(
        sanctioningOutpass.outpassId,
        decision,
        wardenRemarks || (decision === 'APPROVED' ? 'Sanctioned by Executive Warden' : 'Declined by Executive Warden'),
        currentUser
      );
      setSanctioningOutpass(null);
      setWardenRemarks('');
    } catch (e) {
      console.error('Error during warden sanction', e);
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const handleExportCensusCSV = () => {
    const headers = [
      'Pass ID',
      'Student Name',
      'Register Number',
      'Hostel Block',
      'Room Number',
      'Category',
      'Destination',
      'Departure Schedule',
      'Return Schedule',
      'Gate Exit Verified',
      'Gate Return Verified',
      'Status',
      'Emergency Contact'
    ];

    const rows = filteredRequests.map(r => [
      r.outpassId,
      `"${r.studentName}"`,
      r.studentRegNo,
      r.hostelBlock,
      r.roomNumber,
      isNativePlaceRequest(r) ? 'NATIVE_PLACE' : (r.isMedicalLeave ? 'MEDICAL_LEAVE' : (r.category || 'GENERAL')),
      `"${r.destination}"`,
      r.departureDateTime,
      r.returnDateTime,
      r.gateLogs?.departedAt ? `"${r.gateLogs.departedAt}"` : 'NOT_EXITED',
      r.gateLogs?.returnedAt ? `"${r.gateLogs.returnedAt}"` : 'NOT_RETURNED',
      r.status,
      r.parentPhone || r.studentPhone
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MIT_Hostel_Executive_Warden_Census_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6">
      {/* Executive Warden Primary Identity Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-blue-950/90 border border-blue-700/80 flex items-center justify-center text-blue-400 shrink-0 shadow-lg shadow-blue-950/40">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {currentUser.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-950 border border-blue-700 text-blue-300 shadow">
                  Executive Warden Office
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Verified Gate Analytics
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Madras Institute of Technology, Anna University • Outpass Statistics, Health Sanitation & Hostel Headcount
              </p>
            </div>
          </div>

          {/* Quick Actions & CSV Export */}
          <div className="flex flex-wrap items-center gap-2.5">
            {onNavigateToHolidayMess && (
              <button
                onClick={onNavigateToHolidayMess}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer"
              >
                <span>Holiday Mess Planning</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleExportCensusCSV}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Census CSV</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* THREE MANDATORY STATISTICAL SUMMARY CARDS: A, B, and C */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-5 border-t border-zinc-800">
          
          {/* ----------------------------------------------------------------------- */}
          {/* SUMMARY CARD A: Students at Native Place */}
          {/* ----------------------------------------------------------------------- */}
          <div 
            onClick={() => setDrillDownTarget('NATIVE_ALL')}
            className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 via-zinc-950 to-zinc-950 border border-blue-800/80 shadow-lg cursor-pointer hover:border-blue-500 hover:shadow-blue-950/30 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Home className="w-4 h-4 text-blue-400" />
                A. Students at Native Place
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-800 group-hover:bg-blue-600 group-hover:text-white transition">
                Drill-Down →
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {ewStats.nativePlace.currentlyAway}
              </span>
              <span className="text-xs font-mono text-blue-300">Currently at Native</span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-1">
              Verified physically departed via gate check-out records.
            </p>

            {/* Sub-counts distinguishing approved not exited vs away vs returned */}
            <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-zinc-800/80 text-[11px] font-mono">
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('NATIVE_APPROVED'); }}
                className="p-1.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
                title="Approved but not yet departed through campus gate"
              >
                <span className="text-[10px] text-zinc-400 block">Not Exited</span>
                <span className="font-bold text-amber-400">{ewStats.nativePlace.approvedUnused}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('NATIVE_AWAY'); }}
                className="p-1.5 rounded bg-blue-950/60 hover:bg-blue-900/80 text-center cursor-pointer border border-blue-900"
                title="Verified outside campus by security gate"
              >
                <span className="text-[10px] text-blue-300 block">Away</span>
                <span className="font-bold text-blue-400">{ewStats.nativePlace.currentlyAway}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('NATIVE_RETURNED'); }}
                className="p-1.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
                title="Returned to campus (excluded from active away)"
              >
                <span className="text-[10px] text-zinc-400 block">Returned</span>
                <span className="font-bold text-emerald-400">{ewStats.nativePlace.returned}</span>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* SUMMARY CARD B: Medical-Leave Outpasses (Sanitation Operational Focus) */}
          {/* ----------------------------------------------------------------------- */}
          <div 
            onClick={() => setDrillDownTarget('MEDICAL_ALL')}
            className="p-4 rounded-xl bg-gradient-to-br from-red-950/40 via-zinc-950 to-zinc-950 border border-red-800/80 shadow-lg cursor-pointer hover:border-red-500 hover:shadow-red-950/30 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-red-400 animate-pulse" />
                B. Medical-Leave Outpasses
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-900/60 text-red-200 border border-red-800 group-hover:bg-red-600 group-hover:text-white transition">
                Sanitation List →
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {ewStats.medicalLeave.currentlyAway}
              </span>
              <span className="text-xs font-mono text-red-300">Away for Recovery</span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-1">
              Authorized sanitation-related operational tracking. <span className="text-zinc-500">(Private clinical notes suppressed)</span>
            </p>

            {/* Sub-counts distinguishing approved vs away vs returned */}
            <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-zinc-800/80 text-[11px] font-mono">
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('MEDICAL_APPROVED'); }}
                className="p-1.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
                title="Sanctioned medical leave, yet to depart gate"
              >
                <span className="text-[10px] text-zinc-400 block">Approved</span>
                <span className="font-bold text-amber-400">{ewStats.medicalLeave.approvedUnused}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('MEDICAL_AWAY'); }}
                className="p-1.5 rounded bg-red-950/60 hover:bg-red-900/80 text-center cursor-pointer border border-red-900"
                title="Away at home / hospital"
              >
                <span className="text-[10px] text-red-300 block">Exited</span>
                <span className="font-bold text-red-400">{ewStats.medicalLeave.currentlyAway}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('MEDICAL_RETURNED'); }}
                className="p-1.5 rounded bg-zinc-900/90 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
                title="Returned safely to campus"
              >
                <span className="text-[10px] text-zinc-400 block">Returned</span>
                <span className="font-bold text-emerald-400">{ewStats.medicalLeave.returned}</span>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* SUMMARY CARD C: Current Hostel Status */}
          {/* ----------------------------------------------------------------------- */}
          <div 
            onClick={() => setDrillDownTarget('STATUS_ALL')}
            className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 border border-emerald-800/80 shadow-lg cursor-pointer hover:border-emerald-500 hover:shadow-emerald-950/30 transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                C. Current Hostel Status
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition">
                Headcount →
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-white">
                {ewStats.hostelStatus.currentlyPresent}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                / {ewStats.hostelStatus.totalRegistered} Registered ({ewStats.hostelStatus.presencePercentage}%)
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-1">
              Estimated physical occupancy verified by gate check-in & check-out logs.
            </p>

            {/* Sub-counts: Registered, Present, Away, Unused, Unverified */}
            <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-zinc-800/80 text-[10px] font-mono">
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('STATUS_PRESENT'); }}
                className="p-1 rounded bg-emerald-950/50 hover:bg-emerald-900/70 text-center cursor-pointer border border-emerald-900"
              >
                <span className="text-emerald-400 block font-semibold">Present</span>
                <span className="font-bold text-white text-xs">{ewStats.hostelStatus.currentlyPresent}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('STATUS_AWAY'); }}
                className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
              >
                <span className="text-zinc-400 block font-semibold">Away</span>
                <span className="font-bold text-blue-400 text-xs">{ewStats.hostelStatus.currentlyAway}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('STATUS_UNUSED'); }}
                className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
              >
                <span className="text-zinc-400 block font-semibold">Unused</span>
                <span className="font-bold text-amber-400 text-xs">{ewStats.hostelStatus.approvedUnused}</span>
              </div>
              <div 
                onClick={(e) => { e.stopPropagation(); setDrillDownTarget('STATUS_UNVERIFIED'); }}
                className="p-1 rounded bg-zinc-900 hover:bg-zinc-800 text-center cursor-pointer border border-zinc-800"
                title="Students whose status cannot be verified from gate events"
              >
                <span className="text-zinc-400 block font-semibold">Unverified</span>
                <span className="font-bold text-zinc-300 text-xs">{ewStats.hostelStatus.unverifiedCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FILTER & DRILL-DOWN CONTROL BAR (Requirement 3) */}
      {/* ========================================================================= */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex items-center justify-between text-xs font-mono font-bold text-zinc-300">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-blue-400" />
            <span>EXECUTIVE RECORD FILTERS & SEARCH</span>
          </div>
          <button
            onClick={() => {
              setSelectedBlock('ALL');
              setSelectedStatus('ALL');
              setSelectedCategory('ALL');
              setSelectedRC('ALL');
              setStartDateFilter('');
              setEndDateFilter('');
              setSearchQuery('');
            }}
            className="text-blue-400 hover:underline cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* 1. Search by Reg No or Name */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Reg No, Name, or Room..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 2. Hostel Block Filter */}
          <div>
            <select
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">All Hostel Blocks</option>
              {HOSTEL_BLOCKS.map(b => (
                <option key={b} value={b}>{b} Block</option>
              ))}
            </select>
          </div>

          {/* 3. Outpass Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              <option value="NATIVE">Native Place</option>
              <option value="MEDICAL">Medical Leave</option>
              <option value="GENERAL">General Outpass</option>
              <option value="OFFICIAL_OD">Official OD</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>

          {/* 4. Workflow Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="ALL">All Workflow Statuses</option>
              <option value="PENDING_RC">Pending RC</option>
              <option value="APPROVED">Approved (Gate Ready)</option>
              <option value="OUT_OF_CAMPUS">Out of Campus (Away)</option>
              <option value="RETURNED_TO_CAMPUS">Returned to Campus</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* 5. Date Range Filter */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-1/2 px-1.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 focus:outline-none"
              title="From Departure Date"
            />
            <span className="text-zinc-600">→</span>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-1/2 px-1.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 focus:outline-none"
              title="To Departure Date"
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-zinc-800 gap-2 sm:gap-4">
        <button
          onClick={() => setActiveTab('EXECUTIVE_SUMMARY')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'EXECUTIVE_SUMMARY' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-400" />
          <span>Hostel Census Matrix</span>
        </button>

        <button
          onClick={() => setActiveTab('OPERATIONAL_SANITE')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'OPERATIONAL_SANITE' ? 'border-amber-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Lock className="w-4 h-4 text-amber-400" />
          <span>Sanitation Operational List ({operationalSanitationRecords.length})</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
            Privacy Protected
          </span>
        </button>

        <button
          onClick={() => setActiveTab('CLINICAL_REGISTER')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'CLINICAL_REGISTER' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <HeartPulse className="w-4 h-4 text-red-400" />
          <span>Inmate Health & Disease Register</span>
        </button>

        <button
          onClick={() => setActiveTab('MASTER_ROSTER')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'MASTER_ROSTER' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-4 h-4 text-zinc-400" />
          <span>Master Outpass Roster ({filteredRequests.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'AUDIT_LOGS' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <History className="w-4 h-4 text-zinc-400" />
          <span>Institutional Audit Trail</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EXECUTIVE OVERVIEW & HEADCOUNT MATRIX */}
      {/* ========================================================================= */}
      {activeTab === 'EXECUTIVE_SUMMARY' && (
        <div className="space-y-6">
          {/* Hostel Blocks Grid */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span>Hostel Block Inmate Census Distribution</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real-time headcount comparison: Number of people inside hostel vs. students who have gone out
                </p>
              </div>

              {inspectBlock && (
                <button
                  onClick={() => setInspectBlock(null)}
                  className="text-xs font-mono text-blue-400 hover:underline cursor-pointer"
                >
                  Clear Block Filter ({inspectBlock})
                </button>
              )}
            </div>

            {/* 11 Hostel Blocks Interactive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {HOSTEL_BLOCKS.map(block => {
                const bStats = ewStats.blockBreakdown[block] || {
                  registered: 80,
                  present: 80,
                  away: 0,
                  approvedUnused: 0,
                  nativeAway: 0,
                  medicalAway: 0
                };
                const isSelected = inspectBlock === block;

                return (
                  <div
                    key={block}
                    onClick={() => setInspectBlock(isSelected ? null : block)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-950/60 border-blue-600 shadow-md ring-1 ring-blue-500' 
                        : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-bold text-white">{block} Block</span>
                      <span className="text-[10px] font-mono text-zinc-400">Cap: {bStats.registered}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
                        <span className="text-[10px] text-emerald-400 block font-mono">In Hostel</span>
                        <span className="font-mono font-black text-emerald-300 text-sm">{bStats.present}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-950/30 border border-blue-900/50">
                        <span className="text-[10px] text-blue-400 block font-mono">Gone Out</span>
                        <span className="font-mono font-black text-blue-300 text-sm">{bStats.away}</span>
                      </div>
                    </div>

                    {(bStats.nativeAway > 0 || bStats.medicalAway > 0) && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                        <span>Native: <span className="text-blue-300 font-bold">{bStats.nativeAway}</span></span>
                        <span>Medical: <span className="text-red-300 font-bold">{bStats.medicalAway}</span></span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OPERATIONAL SANITATION WORKFLOW (Requirement 2B & 3) */}
      {/* Strict Privacy: No clinical diagnoses, doctor notes, or private details */}
      {/* ========================================================================= */}
      {activeTab === 'OPERATIONAL_SANITE' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/70 text-xs text-amber-200 space-y-1">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Authorized Sanitation & Disinfection Workflow (Data Minimization Enforced)</span>
            </div>
            <p className="text-zinc-300 text-[11px] leading-relaxed">
              In strict accordance with privacy regulations, this operational list provides only the minimum information necessary for hostel sanitization, room maintenance, and baggage logistics. Medical diagnoses, symptoms, doctor names, and clinical notes are <span className="text-amber-300 font-bold">strictly suppressed</span>.
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Sanitation Operations Roster ({operationalSanitationRecords.length} records)
                </h3>
                <p className="text-xs text-zinc-400">
                  Approved medical-leave passes for room disinfection scheduling
                </p>
              </div>
            </div>

            {operationalSanitationRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400">
                No active medical sanitation outpasses matching current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3">Pass ID</th>
                      <th className="py-2.5 px-3">Student Name</th>
                      <th className="py-2.5 px-3">Register Number</th>
                      <th className="py-2.5 px-3">Hostel Block & Room</th>
                      <th className="py-2.5 px-3">Departure Date</th>
                      <th className="py-2.5 px-3">Expected Return</th>
                      <th className="py-2.5 px-3">Sanitation Gate Status</th>
                      <th className="py-2.5 px-3">Guardian Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                    {operationalSanitationRecords.map(r => (
                      <tr key={r.outpassId} className="hover:bg-zinc-900/50">
                        <td className="py-2.5 px-3 font-mono text-zinc-400 font-semibold">{r.outpassId}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{r.studentName}</td>
                        <td className="py-2.5 px-3 font-mono text-blue-300 font-bold">{r.studentRegNo}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-emerald-300">Rm {r.roomNumber}</span>
                          <span className="text-zinc-400 text-[11px] block">{r.hostelBlock} Block</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-300">{formatDate(r.departureDateTime)}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-amber-300">{formatDate(r.returnDateTime)}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            r.gateStatus === 'CURRENTLY_AWAY' ? 'bg-red-950 text-red-300 border border-red-800' :
                            r.gateStatus === 'APPROVED_NOT_DEPARTED' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                            'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {r.gateStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-300">{r.emergencyContact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CLINICAL HEALTH & DISEASE REGISTER (Warden Medical Oversight) */}
      {/* ========================================================================= */}
      {activeTab === 'CLINICAL_REGISTER' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-red-400" />
                <span>Executive Warden Clinical Health & Epidemic Surveillance Desk</span>
              </h3>
              <p className="text-xs text-zinc-400">
                Official register displaying: Type of Disease, Register Number, Room & Block for authorized warden medical sanctioning.
              </p>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-3">Pass ID</th>
                    <th className="py-3 px-3">Type of Disease</th>
                    <th className="py-3 px-3">Register Number</th>
                    <th className="py-3 px-3">Room & Block</th>
                    <th className="py-3 px-3">Student Name</th>
                    <th className="py-3 px-3">Doctor / Clinic</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                  {filteredRequests.filter(r => isApprovedMedicalRequest(r) || r.isMedicalLeave).map(req => {
                    const disease = req.diseaseType || req.medicalDetails?.diseaseType || 'Medical Holiday';
                    return (
                      <tr key={req.outpassId} className="hover:bg-zinc-900/50">
                        <td className="py-3 px-3 font-mono text-zinc-400 font-bold">{req.outpassId}</td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-950 text-red-300 border border-red-800">
                            <HeartPulse className="w-3 h-3 text-red-400" />
                            <span>{disease}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-bold text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-900">
                            {req.studentRegNo}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium">
                          <span className="font-bold text-emerald-300">Rm {req.roomNumber}</span>
                          <span className="text-zinc-400 text-[11px] block">{req.hostelBlock} Block</span>
                        </td>
                        <td className="py-3 px-3 font-bold text-white">{req.studentName}</td>
                        <td className="py-3 px-3 text-zinc-300">
                          {req.medicalDetails?.hospitalClinic || 'MIT Health Centre'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                            {req.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => setSelectedForPrint(req)}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: MASTER OUTPASS ROSTER (Comprehensive Filters Applied) */}
      {/* ========================================================================= */}
      {activeTab === 'MASTER_ROSTER' && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Master Outpass Roster ({filteredRequests.length} matching applications)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                <tr>
                  <th className="py-2.5 px-3">Pass ID</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Register Number</th>
                  <th className="py-2.5 px-3">Block & Room</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Destination</th>
                  <th className="py-2.5 px-3">Schedule</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-200">
                {filteredRequests.map(r => (
                  <tr key={r.outpassId} className="hover:bg-zinc-900/50">
                    <td className="py-2.5 px-3 font-mono font-bold text-zinc-400">{r.outpassId}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{r.studentName}</td>
                    <td className="py-2.5 px-3 font-mono text-blue-300 font-bold">{r.studentRegNo}</td>
                    <td className="py-2.5 px-3">{r.hostelBlock} • {r.roomNumber}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                        {isNativePlaceRequest(r) ? 'NATIVE' : (r.isMedicalLeave ? 'MEDICAL' : (r.category || 'GENERAL'))}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-300">{r.destination}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                      {formatDate(r.departureDateTime)} → {formatDate(r.returnDateTime)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedForPrint(r)}
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs cursor-pointer"
                      >
                        Print Pass
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: 20-YEAR INSTITUTIONAL AUDIT TRAIL */}
      {/* ========================================================================= */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-white">
                20-Year Institutional Compliance Audit Logs
              </h3>
              <p className="text-xs text-zinc-400">
                Immutable chronological log of all outpass creations, endorsements, check-outs, and check-ins.
              </p>
            </div>
            <button
              onClick={() => {
                setIsLoadingLogs(true);
                getAuditLogs().then(logs => setAuditLogs(logs)).finally(() => setIsLoadingLogs(false));
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="divide-y divide-zinc-800 text-xs">
            {auditLogs.map(log => (
              <div key={log.eventId} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-zinc-400 font-bold">{log.action}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                      {log.actorRole}
                    </span>
                    <span className="text-white font-bold">{log.actorName}</span>
                  </div>
                  <p className="text-zinc-400 text-[11px] mt-0.5">{log.remarks}</p>
                </div>
                <div className="font-mono text-[11px] text-zinc-500 shrink-0">
                  {formatDate(log.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUMMARY CARD CONTRIBUTING RECORDS DRILL-DOWN MODAL (Requirement 3) */}
      {/* ========================================================================= */}
      {drillDownTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Contributing Records Drill-Down: {drillDownTarget.replace(/_/g, ' ')}</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Displaying {drillDownRecords.length} records contributing to this statistical card
                </p>
              </div>
              <button
                onClick={() => setDrillDownTarget(null)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {drillDownRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400">
                  No contributing records match the active criteria.
                </div>
              ) : (
                <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Pass ID</th>
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">Register Number</th>
                        <th className="py-2.5 px-3">Block & Room</th>
                        <th className="py-2.5 px-3">Departure Date</th>
                        <th className="py-2.5 px-3">Expected Return</th>
                        <th className="py-2.5 px-3">Gate Status</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-200">
                      {drillDownRecords.map(r => (
                        <tr key={r.outpassId} className="hover:bg-zinc-900/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-400">{r.outpassId}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{r.studentName}</td>
                          <td className="py-2.5 px-3 font-mono text-blue-300 font-bold">{r.studentRegNo}</td>
                          <td className="py-2.5 px-3">{r.hostelBlock} • Rm {r.roomNumber}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-300">{formatDate(r.departureDateTime)}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-amber-300">{formatDate(r.returnDateTime)}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300">
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => {
                                setDrillDownTarget(null);
                                setSelectedForPrint(r);
                              }}
                              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-xs cursor-pointer"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-3 bg-zinc-950 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setDrillDownTarget(null)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold cursor-pointer"
              >
                Close Drill-Down
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pass Printable Modal */}
      {selectedForPrint && (
        <PrintableOutpassModal
          outpass={selectedForPrint}
          onClose={() => setSelectedForPrint(null)}
        />
      )}
    </div>
  );
};
