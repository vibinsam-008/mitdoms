import React, { useState, useEffect } from 'react';
import { UserProfile, OutpassRequest, AuditLogEntry, HOSTEL_BLOCKS, COMMON_DISEASES } from '../types';
import { getAuditLogs, getAcademicYear, ewEndorseOutpass } from '../firebase/dbService';
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
  ExternalLink
} from 'lucide-react';

interface EWDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
}

export const EWDashboard: React.FC<EWDashboardProps> = ({ currentUser, requests }) => {
  const currentAcademicYear = getAcademicYear();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(currentAcademicYear);
  const [activeTab, setActiveTab] = useState<'HOME' | 'MEDICAL_HUB' | 'ROSTER' | 'AUDIT_LOGS'>('HOME');
  
  // Filters
  const [selectedBlock, setSelectedBlock] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDiseaseFilter, setSelectedDiseaseFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  // Inspection & Modals
  const [selectedForPrint, setSelectedForPrint] = useState<OutpassRequest | null>(null);
  const [sanctioningOutpass, setSanctioningOutpass] = useState<OutpassRequest | null>(null);
  const [wardenRemarks, setWardenRemarks] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [inspectBlock, setInspectBlock] = useState<string | null>(null);

  // Generate 20-Year Academic Year Range
  const generate20YearRange = () => {
    const list: string[] = [];
    const baseYear = 2026;
    for (let i = 0; i < 20; i++) {
      const start = baseYear - 2 + i;
      list.push(`${start}-${start + 1}`);
    }
    return list;
  };
  const academicYears = generate20YearRange();

  useEffect(() => {
    if (activeTab === 'AUDIT_LOGS') {
      setIsLoadingLogs(true);
      getAuditLogs()
        .then(logs => setAuditLogs(logs))
        .finally(() => setIsLoadingLogs(false));
    }
  }, [activeTab]);

  // Overall Campus Occupancy Calculation (MIT Hostels baseline)
  // Baseline capacity per block for accurate census calculation
  const BLOCK_CAPACITIES: Record<string, number> = {
    'Marutham': 120,
    'Thamirabarani': 110,
    'Kaveri': 105,
    'Vaigai': 95,
    'Amaravathi': 85,
    'Bhavani': 80,
    'Ponni': 75,
    'Ganga': 90,
    'Kurinji': 70,
    'Orchid': 65,
    'NRI Hostel': 55
  };
  const totalHostelCapacity = Object.values(BLOCK_CAPACITIES).reduce((acc, v) => acc + v, 0); // 950 inmates

  // Requests currently outside campus
  const inmatesGoneOut = requests.filter(r => r.status === 'OUT_OF_CAMPUS');
  const totalGoneOutCount = inmatesGoneOut.length;
  const totalInHostelCount = Math.max(0, totalHostelCapacity - totalGoneOutCount);
  const presencePercentage = ((totalInHostelCount / totalHostelCapacity) * 100).toFixed(1);

  // Medical Holiday Applications
  const medicalRequests = requests.filter(r => 
    r.isMedicalLeave === true || 
    r.category === 'MEDICAL' || 
    (r.diseaseType && r.diseaseType.trim().length > 0) ||
    r.purpose.toLowerCase().includes('medical') ||
    r.purpose.toLowerCase().includes('fever') ||
    r.purpose.toLowerCase().includes('hospital') ||
    r.purpose.toLowerCase().includes('dengue')
  );

  const activeMedicalLeaves = medicalRequests.filter(r => ['PENDING_RC', 'APPROVED', 'OUT_OF_CAMPUS'].includes(r.status));
  const pendingEWSanctions = requests.filter(r => r.status === 'PENDING_RC');
  const readyAtGate = requests.filter(r => r.status === 'APPROVED');
  const returnedSafely = requests.filter(r => r.status === 'RETURNED_TO_CAMPUS');

  // Overdue Inmates
  const overdueInmates = requests.filter(r => {
    if (r.status !== 'OUT_OF_CAMPUS') return false;
    return Date.now() > new Date(r.returnDateTime).getTime();
  });

  // Filtered requests for Roster and Medical views
  const filteredRequests = requests.filter(req => {
    if (selectedAcademicYear && req.academicYear && req.academicYear !== selectedAcademicYear) {
      if (req.academicYear !== selectedAcademicYear && selectedAcademicYear !== currentAcademicYear) {
        return false;
      }
    }
    if (selectedBlock !== 'ALL' && req.hostelBlock !== selectedBlock) return false;
    if (selectedStatus !== 'ALL' && req.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.studentName.toLowerCase().includes(q);
      const matchReg = req.studentRegNo.toLowerCase().includes(q);
      const matchDest = req.destination.toLowerCase().includes(q);
      const matchId = req.outpassId.toLowerCase().includes(q);
      const matchDisease = (req.diseaseType || req.medicalDetails?.diseaseType || '').toLowerCase().includes(q);
      if (!matchName && !matchReg && !matchDest && !matchId && !matchDisease) return false;
    }
    return true;
  });

  // Filtered Medical Applications
  const filteredMedicalRequests = medicalRequests.filter(req => {
    if (selectedBlock !== 'ALL' && req.hostelBlock !== selectedBlock) return false;
    if (selectedDiseaseFilter !== 'ALL') {
      const d = (req.diseaseType || req.medicalDetails?.diseaseType || '').toLowerCase();
      if (!d.includes(selectedDiseaseFilter.toLowerCase())) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.studentName.toLowerCase().includes(q);
      const matchReg = req.studentRegNo.toLowerCase().includes(q);
      const matchDisease = (req.diseaseType || req.medicalDetails?.diseaseType || '').toLowerCase().includes(q);
      const matchRoom = req.roomNumber.toLowerCase().includes(q);
      if (!matchName && !matchReg && !matchDisease && !matchRoom) return false;
    }
    return true;
  });

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

  const handleExportCSV = () => {
    const headers = [
      'Pass ID',
      'Student Name',
      'Register Number',
      'Hostel Block',
      'Room Number',
      'Type of Leave',
      'Type of Disease',
      'Doctor / Clinic',
      'Destination',
      'Departure',
      'Expected Return',
      'Status',
      'Parent Contact'
    ];

    const rows = requests.map(r => [
      r.outpassId,
      `"${r.studentName}"`,
      r.studentRegNo,
      r.hostelBlock,
      r.roomNumber,
      r.isMedicalLeave ? 'MEDICAL HOLIDAY' : 'GENERAL OUTPASS',
      `"${r.diseaseType || r.medicalDetails?.diseaseType || 'N/A'}"`,
      `"${r.medicalDetails?.hospitalClinic || 'N/A'}"`,
      `"${r.destination}"`,
      r.departureDateTime,
      r.returnDateTime,
      r.status,
      r.parentPhone
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

  const getDiseaseBadgeColor = (disease?: string) => {
    if (!disease) return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    const lower = disease.toLowerCase();
    if (lower.includes('dengue') || lower.includes('typhoid') || lower.includes('chickenpox')) {
      return 'bg-red-950/90 text-red-300 border-red-700 font-bold';
    }
    if (lower.includes('fever') || lower.includes('infection') || lower.includes('poisoning')) {
      return 'bg-amber-950/90 text-amber-300 border-amber-700 font-semibold';
    }
    if (lower.includes('fracture') || lower.includes('orthopedic') || lower.includes('sprain')) {
      return 'bg-purple-950/90 text-purple-300 border-purple-700 font-semibold';
    }
    return 'bg-blue-950/90 text-blue-300 border-blue-700';
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
                  Live Census & Health Active
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Madras Institute of Technology, Anna University • Campus Inmate Headcount & Medical Surveillance
              </p>
            </div>
          </div>

          {/* Academic Year & Export Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-zinc-400 font-mono">Academic Year:</span>
              <select
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer"
              >
                {academicYears.map(yr => (
                  <option key={yr} value={yr} className="bg-zinc-900 text-white">{yr}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Full Census</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TOP METRIC CARDS: NUMBER IN HOSTEL, PEOPLE WHO HAVE GONE OUT, MEDICAL APPS */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mt-6 pt-5 border-t border-zinc-800">
          {/* Card 1: People in the Hostel */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-zinc-950 border border-emerald-800/60 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                People In Hostel
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200">
                {presencePercentage}% Present
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                {totalInHostelCount}
              </span>
              <span className="text-xs text-zinc-400 font-mono">/ {totalHostelCapacity}</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Inmates present in campus blocks</p>
          </div>

          {/* Card 2: People Who Have Gone Out */}
          <div 
            onClick={() => {
              setActiveTab('HOME');
              setSelectedStatus('OUT_OF_CAMPUS');
            }}
            className="p-4 rounded-xl bg-gradient-to-br from-blue-950/50 to-zinc-950 border border-blue-800/70 shadow-lg cursor-pointer hover:border-blue-600 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                People Gone Out
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-200">
                Gate Checked
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                {totalGoneOutCount}
              </span>
              <span className="text-xs text-blue-300 font-mono">Inmates Outside</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Currently checked out at gate</p>
          </div>

          {/* Card 3: Medical Holiday Applications */}
          <div 
            onClick={() => setActiveTab('MEDICAL_HUB')}
            className="p-4 rounded-xl bg-gradient-to-br from-red-950/50 to-zinc-950 border border-red-800/80 shadow-lg cursor-pointer hover:border-red-600 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                Medical Holidays
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-900/60 text-red-200 font-bold">
                {activeMedicalLeaves.length} Active
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-red-400">
                {medicalRequests.length}
              </span>
              <span className="text-xs text-red-300 font-mono">Applications</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Sick leave & home recovery permits</p>
          </div>

          {/* Card 4: Approved & Ready at Gate */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 shadow">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                Gate Ready
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Approved
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
                {readyAtGate.length}
              </span>
              <span className="text-xs text-zinc-400 font-mono">Passes</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Cleared by RC/Warden, yet to exit</p>
          </div>

          {/* Card 5: Overdue / Past Curfew */}
          <div className={`p-4 rounded-xl border shadow ${
            overdueInmates.length > 0 ? 'bg-red-950/70 border-red-700 animate-pulse' : 'bg-zinc-950 border-zinc-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider font-mono flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                Overdue Curfew
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl sm:text-3xl font-black font-mono ${
                overdueInmates.length > 0 ? 'text-red-300' : 'text-zinc-500'
              }`}>
                {overdueInmates.length}
              </span>
              <span className="text-xs text-zinc-400 font-mono">Violations</span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Inmates past expected return time</p>
          </div>
        </div>
      </div>

      {/* Main Exclusive Navigation Tabs */}
      <div className="flex flex-wrap border-b border-zinc-800 gap-2 sm:gap-4">
        <button
          onClick={() => setActiveTab('HOME')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'HOME' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Building2 className="w-4 h-4 text-blue-400" />
          <span>Executive Overview & Headcount</span>
        </button>

        <button
          onClick={() => setActiveTab('MEDICAL_HUB')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'MEDICAL_HUB' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <HeartPulse className="w-4 h-4 text-red-400" />
          <span>Medical Holiday Applications</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-950 text-red-300 border border-red-800">
            {medicalRequests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ROSTER')}
          className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'ROSTER' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
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
          <span>20-Year Security Audit Logs</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: EXECUTIVE HOME PAGE (Headcount + Medical Cases Spotlight) */}
      {/* ========================================================================= */}
      {activeTab === 'HOME' && (
        <div className="space-y-6">
          {/* Overdue Inmates Urgent Callout */}
          {overdueInmates.length > 0 && (
            <div className="p-4 sm:p-5 rounded-2xl bg-red-950/80 border border-red-700 text-red-200 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    CURFEW ALERT: {overdueInmates.length} Inmate(s) Past Mandatory Campus Return Time
                  </h3>
                </div>
                <span className="text-xs font-mono bg-red-900/80 px-2.5 py-1 rounded-md text-red-200 font-bold">
                  Immediate Security Notice
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {overdueInmates.map(req => (
                  <div key={req.outpassId} className="p-3 rounded-xl bg-zinc-950 border border-red-800/80 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white text-xs sm:text-sm">{req.studentName} ({req.studentRegNo})</p>
                      <p className="text-xs text-zinc-400">{req.hostelBlock} Block • Room {req.roomNumber} • Parent: <span className="font-mono text-zinc-200">{req.parentPhone}</span></p>
                    </div>
                    <span className="text-xs font-mono font-bold text-red-400 shrink-0">
                      Due: {formatDate(req.returnDateTime)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 1: Number of People in the Hostel and People Who Have Gone Out */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <span>Hostel Block Inmate Census Matrix</span>
                </h2>
                <p className="text-xs text-zinc-400">
                  Real-time headcount comparison: Number of people inside hostel vs. students who have gone out
                </p>
              </div>

              {inspectBlock && (
                <button
                  onClick={() => setInspectBlock(null)}
                  className="self-start text-xs font-mono text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Showing {inspectBlock} Block Inmates</span>
                  <span className="font-bold">× Reset</span>
                </button>
              )}
            </div>

            {/* Visual Headcount Distribution Meter */}
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400 font-bold">● In Hostel: {totalInHostelCount} Inmates ({presencePercentage}%)</span>
                <span className="text-blue-400 font-bold">● Gone Out: {totalGoneOutCount} Outside ({(100 - Number(presencePercentage)).toFixed(1)}%)</span>
              </div>
              <div className="w-full h-3 rounded-full bg-blue-900/60 overflow-hidden flex">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${presencePercentage}%` }} 
                />
                <div 
                  className="h-full bg-blue-500 transition-all duration-500" 
                  style={{ width: `${100 - Number(presencePercentage)}%` }} 
                />
              </div>
            </div>

            {/* 11 Hostel Blocks Interactive Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {HOSTEL_BLOCKS.map(block => {
                const capacity = BLOCK_CAPACITIES[block] || 80;
                const blockRequests = requests.filter(r => r.hostelBlock === block);
                const outCount = blockRequests.filter(r => r.status === 'OUT_OF_CAMPUS').length;
                const inCount = Math.max(0, capacity - outCount);
                const medicalCount = blockRequests.filter(r => r.isMedicalLeave || r.category === 'MEDICAL' || r.diseaseType).length;
                const isSelected = inspectBlock === block;

                return (
                  <div
                    key={block}
                    onClick={() => setInspectBlock(isSelected ? null : block)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-950/60 border-blue-600 shadow-md ring-1 ring-blue-500' 
                        : 'bg-zinc-950 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-950/80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-bold text-white tracking-tight">{block} Block</span>
                      <span className="text-[10px] font-mono text-zinc-400">Cap: {capacity}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
                        <span className="text-[10px] text-emerald-400 block font-mono">In Hostel</span>
                        <span className="font-mono font-black text-emerald-300 text-sm">{inCount}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-blue-950/30 border border-blue-900/50">
                        <span className="text-[10px] text-blue-400 block font-mono">Gone Out</span>
                        <span className="font-mono font-black text-blue-300 text-sm">{outCount}</span>
                      </div>
                    </div>

                    {medicalCount > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-red-300">
                        <span className="flex items-center gap-1">
                          <HeartPulse className="w-3 h-3 text-red-400" />
                          <span>Medical Holiday:</span>
                        </span>
                        <span className="font-mono font-bold bg-red-950 px-1.5 py-0.2 rounded border border-red-800">
                          {medicalCount} {medicalCount === 1 ? 'case' : 'cases'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* List of Inmates Currently Gone Out (Active Campus Exits) */}
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <span>
                    {inspectBlock 
                      ? `Inmates Currently Gone Out from ${inspectBlock} Block (${inmatesGoneOut.filter(r => r.hostelBlock === inspectBlock).length})`
                      : `All Inmates Currently Gone Out Across Campus (${inmatesGoneOut.length})`}
                  </span>
                </h3>
              </div>

              {inmatesGoneOut.filter(r => !inspectBlock || r.hostelBlock === inspectBlock).length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/60 text-center text-xs text-zinc-400">
                  No inmates currently outside from {inspectBlock ? `${inspectBlock} Block` : 'campus'}. All inmates are in the hostel.
                </div>
              ) : (
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden shadow">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3">Pass ID</th>
                          <th className="py-2.5 px-3">Student Name</th>
                          <th className="py-2.5 px-3">Register Number</th>
                          <th className="py-2.5 px-3">Hostel Block & Room</th>
                          <th className="py-2.5 px-3">Destination</th>
                          <th className="py-2.5 px-3">Departed Gate At</th>
                          <th className="py-2.5 px-3">Expected Return</th>
                          <th className="py-2.5 px-3">Emergency Contact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                        {inmatesGoneOut
                          .filter(r => !inspectBlock || r.hostelBlock === inspectBlock)
                          .map(r => (
                            <tr key={r.outpassId} className="hover:bg-zinc-900/50">
                              <td className="py-2.5 px-3 font-mono text-zinc-400">{r.outpassId}</td>
                              <td className="py-2.5 px-3 font-bold text-white">{r.studentName}</td>
                              <td className="py-2.5 px-3 font-mono text-blue-300 font-semibold">{r.studentRegNo}</td>
                              <td className="py-2.5 px-3">{r.hostelBlock} • Rm {r.roomNumber}</td>
                              <td className="py-2.5 px-3 font-medium text-zinc-300">{r.destination}</td>
                              <td className="py-2.5 px-3 font-mono text-zinc-400 text-[11px]">
                                {r.gateLogs?.departedAt ? formatDate(r.gateLogs.departedAt) : 'Checked Out'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-amber-400 text-[11px]">{formatDate(r.returnDateTime)}</td>
                              <td className="py-2.5 px-3 font-mono text-zinc-300">{r.parentPhone}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Section 2: Medical Holiday Applications & Disease/Register/Room Spotlight */}
          {/* ========================================================================= */}
          <div className="bg-zinc-900 border border-red-900/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-950 border border-red-800 flex items-center justify-center text-red-400">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Medical Holiday Applications & Inmate Health Register
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Inmate sick leaves displaying: <span className="text-red-300 font-bold">Type of Disease</span>, <span className="text-blue-300 font-bold">Register Number</span> & <span className="text-emerald-300 font-bold">Room Number</span>
                </p>
              </div>

              <button
                onClick={() => setActiveTab('MEDICAL_HUB')}
                className="self-start sm:self-auto flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-800 cursor-pointer"
              >
                <span>Open Full Clinical Hub</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Medical Applications Table */}
            {medicalRequests.length === 0 ? (
              <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-xs text-zinc-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-zinc-200">Zero Active Medical Holidays</p>
                <p className="text-zinc-500 mt-0.5">No students currently on sick leave or isolation.</p>
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900 text-zinc-400 font-mono border-b border-zinc-800">
                      <tr>
                        <th className="py-3 px-4">Pass ID</th>
                        <th className="py-3 px-4">Type of Disease</th>
                        <th className="py-3 px-4">Register Number</th>
                        <th className="py-3 px-4">Room & Block</th>
                        <th className="py-3 px-4">Student Name</th>
                        <th className="py-3 px-4">Doctor / Clinic</th>
                        <th className="py-3 px-4">Medical Leave Period</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                      {medicalRequests.slice(0, 6).map(req => {
                        const disease = req.diseaseType || req.medicalDetails?.diseaseType || 'Medical Holiday';
                        return (
                          <tr key={req.outpassId} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-semibold text-zinc-400">{req.outpassId}</td>
                            
                            {/* Type of Disease */}
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${getDiseaseBadgeColor(disease)}`}>
                                <HeartPulse className="w-3 h-3 shrink-0" />
                                <span>{disease}</span>
                              </span>
                            </td>

                            {/* Register Number */}
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-blue-400 text-xs sm:text-sm bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900">
                                {req.studentRegNo}
                              </span>
                            </td>

                            {/* Room Number & Block */}
                            <td className="py-3 px-4 font-medium text-emerald-300">
                              <span className="font-bold text-white">{req.roomNumber}</span>
                              <span className="text-zinc-400 text-[11px] block">{req.hostelBlock} Block</span>
                            </td>

                            {/* Student Name */}
                            <td className="py-3 px-4">
                              <p className="font-bold text-white">{req.studentName}</p>
                              <p className="text-[11px] text-zinc-400">{req.branch}</p>
                            </td>

                            {/* Doctor / Clinic */}
                            <td className="py-3 px-4 text-zinc-300">
                              <p className="font-medium">{req.medicalDetails?.hospitalClinic || 'MIT Health Centre'}</p>
                              {req.medicalDetails?.doctorName && (
                                <p className="text-[10px] text-zinc-500">{req.medicalDetails.doctorName}</p>
                              )}
                            </td>

                            {/* Leave Period */}
                            <td className="py-3 px-4 font-mono text-[11px] text-zinc-300">
                              <div>{formatDate(req.departureDateTime)}</div>
                              <div className="text-zinc-500">to {formatDate(req.returnDateTime)} ({req.proposedDays}d)</div>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                                req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                                req.status === 'OUT_OF_CAMPUS' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                                req.status === 'RETURNED_TO_CAMPUS' ? 'bg-zinc-800 text-zinc-300' :
                                req.status === 'REJECTED' ? 'bg-red-950 text-red-300 border border-red-800' :
                                'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                              }`}>
                                {req.status.replace(/_/g, ' ')}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {req.status === 'PENDING_RC' && (
                                  <button
                                    onClick={() => setSanctioningOutpass(req)}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow cursor-pointer"
                                  >
                                    Sanction
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedForPrint(req)}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
                                >
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DEDICATED MEDICAL HOLIDAY HUB (Complete Clinical Surveillance Desk) */}
      {/* ========================================================================= */}
      {activeTab === 'MEDICAL_HUB' && (
        <div className="space-y-5">
          {/* Clinical Surveillance Banner */}
          <div className="bg-gradient-to-r from-red-950/60 via-zinc-900 to-zinc-900 border border-red-800/80 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-950 border border-red-700 flex items-center justify-center text-red-400">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Campus Inmate Medical Holiday & Clinical Surveillance Desk
                  </h2>
                  <p className="text-xs text-zinc-300">
                    Mandatory health monitoring: Fast-track sanctioning, contagious disease isolation, and home recovery oversight
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <div className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <span className="text-zinc-400 block text-[10px]">TOTAL MEDICAL CASES</span>
                  <span className="text-base font-bold text-red-400">{medicalRequests.length}</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800">
                  <span className="text-zinc-400 block text-[10px]">CURRENTLY AT HOME</span>
                  <span className="text-base font-bold text-blue-400">{medicalRequests.filter(r => r.status === 'OUT_OF_CAMPUS').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Medical Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-900 p-3.5 rounded-xl border border-zinc-800">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Disease (e.g. Dengue, Fever), Roll No, Student Name, or Room..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Hostel Blocks</option>
                {HOSTEL_BLOCKS.map(b => (
                  <option key={b} value={b}>{b} Block</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedDiseaseFilter}
                onChange={(e) => setSelectedDiseaseFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Disease Types</option>
                <option value="Fever">Viral / High Fever</option>
                <option value="Dengue">Dengue Fever</option>
                <option value="Typhoid">Typhoid</option>
                <option value="Gastroenteritis">Food Poisoning / Stomach</option>
                <option value="Fracture">Orthopedic / Fracture</option>
                <option value="Chickenpox">Chickenpox / Measles</option>
                <option value="Migraine">Migraine</option>
              </select>
            </div>
          </div>

          {/* Full Medical Records Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Pass ID</th>
                    <th className="py-3 px-4 font-bold text-red-400">Type of Disease</th>
                    <th className="py-3 px-4 font-bold text-blue-400">Register Number</th>
                    <th className="py-3 px-4 font-bold text-emerald-400">Room Number & Block</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Clinical Diagnosis / Symptoms</th>
                    <th className="py-3 px-4">Doctor & Clinic</th>
                    <th className="py-3 px-4">Leave Duration</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Sanction Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                  {filteredMedicalRequests.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono">
                        No medical holiday records match the search filter.
                      </td>
                    </tr>
                  ) : (
                    filteredMedicalRequests.map(req => {
                      const disease = req.diseaseType || req.medicalDetails?.diseaseType || 'Medical Leave';
                      return (
                        <tr key={req.outpassId} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-zinc-400">{req.outpassId}</td>

                          {/* Type of Disease */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold border ${getDiseaseBadgeColor(disease)}`}>
                              <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                              <span>{disease}</span>
                            </span>
                          </td>

                          {/* Register Number */}
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-blue-300 text-sm bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800">
                              {req.studentRegNo}
                            </span>
                          </td>

                          {/* Room Number & Block */}
                          <td className="py-3 px-4">
                            <span className="font-bold text-white text-xs">{req.roomNumber}</span>
                            <span className="text-zinc-400 text-[11px] block">{req.hostelBlock} Block</span>
                          </td>

                          {/* Student Name */}
                          <td className="py-3 px-4">
                            <p className="font-bold text-white">{req.studentName}</p>
                            <p className="text-[11px] text-zinc-400">{req.branch}</p>
                          </td>

                          {/* Clinical Diagnosis / Symptoms */}
                          <td className="py-3 px-4 max-w-xs text-zinc-300">
                            <p className="truncate" title={req.purpose}>{req.purpose}</p>
                            {req.medicalDetails?.symptoms && (
                              <p className="text-[11px] text-zinc-500 truncate">{req.medicalDetails.symptoms}</p>
                            )}
                          </td>

                          {/* Doctor & Clinic */}
                          <td className="py-3 px-4 text-zinc-300">
                            <p className="font-medium text-white">{req.medicalDetails?.hospitalClinic || 'MIT Health Centre'}</p>
                            <p className="text-[11px] text-zinc-400">{req.medicalDetails?.doctorName || 'Medical Officer'}</p>
                          </td>

                          {/* Leave Duration */}
                          <td className="py-3 px-4 font-mono text-[11px]">
                            <div className="text-zinc-200">{formatDate(req.departureDateTime)}</div>
                            <div className="text-zinc-400">Return: {formatDate(req.returnDateTime)}</div>
                            <span className="text-[10px] text-zinc-500 font-bold">({req.proposedDays} Days Bed Rest)</span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                              req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                              req.status === 'OUT_OF_CAMPUS' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                              req.status === 'RETURNED_TO_CAMPUS' ? 'bg-zinc-800 text-zinc-300' :
                              req.status === 'REJECTED' ? 'bg-red-950 text-red-300 border border-red-800' :
                              'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                            }`}>
                              {req.status.replace(/_/g, ' ')}
                            </span>
                          </td>

                          {/* Sanction Action */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {req.status === 'PENDING_RC' && (
                                <button
                                  onClick={() => setSanctioningOutpass(req)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                                >
                                  Sanction
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedForPrint(req)}
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
                              >
                                Certificate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MASTER OUTPASS ROSTER (Search All Leaves) */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
            <div className="sm:col-span-2 relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student name, roll number, destination..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
            </div>

            <div>
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Hostel Blocks</option>
                {HOSTEL_BLOCKS.map(b => (
                  <option key={b} value={b}>{b} Block</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_RC">Pending RC</option>
                <option value="APPROVED">Approved (Gate Ready)</option>
                <option value="OUT_OF_CAMPUS">Out of Campus</option>
                <option value="RETURNED_TO_CAMPUS">Returned to Campus</option>
                <option value="REJECTED">Declined</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Pass ID</th>
                    <th className="py-3 px-4">Student & Roll No</th>
                    <th className="py-3 px-4">Block & Room</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Expected Return</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Certificate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredRequests.map(req => (
                    <tr key={req.outpassId} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-zinc-200">{req.outpassId}</td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-white">{req.studentName}</p>
                        <p className="font-mono text-zinc-400 text-[11px]">{req.studentRegNo}</p>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {req.hostelBlock} • Rm {req.roomNumber}
                      </td>
                      <td className="py-3 px-4">
                        {req.isMedicalLeave ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 text-[10px] font-bold">
                            <HeartPulse className="w-3 h-3" /> Medical
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-[11px]">General</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-300 font-medium">{req.destination}</td>
                      <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">{formatDate(req.departureDateTime)}</td>
                      <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">{formatDate(req.returnDateTime)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                          req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          req.status === 'OUT_OF_CAMPUS' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                          req.status === 'RETURNED_TO_CAMPUS' ? 'bg-zinc-800 text-zinc-300' :
                          req.status === 'REJECTED' ? 'bg-red-950 text-red-300 border border-red-800' :
                          'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {req.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedForPrint(req)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: 20-YEAR IMMUTABLE AUDIT LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <span>Permanent Security Audit Trail</span>
              </h3>
              <p className="text-xs text-zinc-400">
                Immutable event records stored in Firebase to guarantee 20-year compliance and auditability
              </p>
            </div>
            <button
              onClick={() => {
                setIsLoadingLogs(true);
                getAuditLogs().then(l => setAuditLogs(l)).finally(() => setIsLoadingLogs(false));
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-950 text-zinc-400 border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Event ID</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Outpass ID</th>
                    <th className="py-3 px-4">Remarks / Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {auditLogs.map(log => (
                    <tr key={log.eventId} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-4 text-zinc-400 text-[11px]">{formatDate(log.timestamp)}</td>
                      <td className="py-2.5 px-4 text-zinc-500 text-[10px]">{log.eventId}</td>
                      <td className="py-2.5 px-4">
                        <span className="font-semibold text-emerald-400">{log.action}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-white">{log.actorName}</span>{' '}
                        <span className="text-zinc-500 text-[10px]">({log.actorRole})</span>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-200">{log.outpassId}</td>
                      <td className="py-2.5 px-4 text-zinc-400 text-[11px] max-w-xs truncate" title={log.remarks}>
                        {log.remarks}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Direct Executive Warden Sanction Modal */}
      {sanctioningOutpass && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Executive Warden Sanction Authority
                </h3>
                <p className="text-xs text-zinc-400">
                  Outpass: <span className="font-mono text-white">{sanctioningOutpass.outpassId}</span>
                </p>
              </div>
              <button
                onClick={() => setSanctioningOutpass(null)}
                className="text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Student:</span>
                <span className="font-bold text-white">{sanctioningOutpass.studentName} ({sanctioningOutpass.studentRegNo})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Hostel Block & Room:</span>
                <span className="text-white font-medium">{sanctioningOutpass.hostelBlock} Block • Room {sanctioningOutpass.roomNumber}</span>
              </div>
              {sanctioningOutpass.diseaseType && (
                <div className="flex justify-between">
                  <span className="text-red-400 font-bold">Type of Disease:</span>
                  <span className="text-red-300 font-bold">{sanctioningOutpass.diseaseType}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-400">Destination:</span>
                <span className="text-white">{sanctioningOutpass.destination}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Parent Mobile:</span>
                <span className="font-mono text-zinc-200">{sanctioningOutpass.parentPhone}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-200 mb-1">
                Warden Official Remarks / Instructions
              </label>
              <textarea
                value={wardenRemarks}
                onChange={(e) => setWardenRemarks(e.target.value)}
                placeholder="e.g. Sanctioned on medical grounds. Inmate instructed to submit medical fitness certificate upon return."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                onClick={() => handleExecuteSanction('REJECTED')}
                disabled={isSubmittingDecision}
                className="px-4 py-2 rounded-lg bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                Decline Leave
              </button>
              <button
                onClick={() => handleExecuteSanction('APPROVED')}
                disabled={isSubmittingDecision}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingDecision ? 'Sanctioning...' : 'Sanction & Issue Outpass'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {selectedForPrint && (
        <PrintableOutpassModal
          outpass={selectedForPrint}
          onClose={() => setSelectedForPrint(null)}
        />
      )}
    </div>
  );
};
