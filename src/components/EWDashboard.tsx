import React, { useState, useEffect } from 'react';
import { UserProfile, OutpassRequest, AuditLogEntry, HOSTEL_BLOCKS } from '../types';
import { getAuditLogs, getAcademicYear } from '../firebase/dbService';
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
  Archive, 
  FileText, 
  ShieldCheck, 
  Calendar,
  Layers,
  History,
  RefreshCw
} from 'lucide-react';

interface EWDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
}

export const EWDashboard: React.FC<EWDashboardProps> = ({ currentUser, requests }) => {
  const currentAcademicYear = getAcademicYear();
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(currentAcademicYear);
  const [selectedBlock, setSelectedBlock] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ROSTER' | 'AUDIT_LOGS'>('OVERVIEW');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [selectedForPrint, setSelectedForPrint] = useState<OutpassRequest | null>(null);

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

  // Filter requests
  const filteredRequests = requests.filter(req => {
    // Academic Year
    if (selectedAcademicYear && req.academicYear && req.academicYear !== selectedAcademicYear) {
      // If requests don't have academicYear, allow matching current
      if (req.academicYear !== selectedAcademicYear && selectedAcademicYear !== currentAcademicYear) {
        return false;
      }
    }
    // Block
    if (selectedBlock !== 'ALL' && req.hostelBlock !== selectedBlock) return false;
    // Status
    if (selectedStatus !== 'ALL' && req.status !== selectedStatus) return false;
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = req.studentName.toLowerCase().includes(q);
      const matchReg = req.studentRegNo.toLowerCase().includes(q);
      const matchDest = req.destination.toLowerCase().includes(q);
      const matchId = req.outpassId.toLowerCase().includes(q);
      if (!matchName && !matchReg && !matchDest && !matchId) return false;
    }
    return true;
  });

  // Analytics Metrics
  const totalInmatesOut = requests.filter(r => r.status === 'OUT_OF_CAMPUS').length;
  const totalApproved = requests.filter(r => r.status === 'APPROVED').length;
  const totalReturned = requests.filter(r => r.status === 'RETURNED_TO_CAMPUS').length;
  const totalPending = requests.filter(r => r.status === 'PENDING_RC').length;

  const overdueInmates = requests.filter(r => {
    if (r.status !== 'OUT_OF_CAMPUS') return false;
    return Date.now() > new Date(r.returnDateTime).getTime();
  });

  // Export to CSV for 20-year archival records
  const handleExportCSV = () => {
    const headers = [
      'Outpass ID',
      'Student Name',
      'Register Number',
      'Hostel Block',
      'Room Number',
      'Branch',
      'Destination',
      'Purpose',
      'Departure Schedule',
      'Return Schedule',
      'Status',
      'Academic Year',
      'RC Endorser',
      'Gate Exit Time',
      'Gate Return Time',
      'Late Flag'
    ];

    const rows = filteredRequests.map(r => [
      r.outpassId,
      `"${r.studentName}"`,
      r.studentRegNo,
      r.hostelBlock,
      r.roomNumber,
      `"${r.branch}"`,
      `"${r.destination}"`,
      `"${r.purpose.replace(/"/g, '""')}"`,
      r.departureDateTime,
      r.returnDateTime,
      r.status,
      r.academicYear,
      r.rcDecision?.rcName || 'N/A',
      r.gateLogs?.departedAt || 'N/A',
      r.gateLogs?.returnedAt || 'N/A',
      r.gateLogs?.isLate ? 'YES' : 'NO'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MIT_Hostels_Outpass_Archive_${selectedAcademicYear}_${Date.now()}.csv`);
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Executive Warden Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800/80 flex items-center justify-center text-blue-400 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {currentUser.name}
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-950 border border-blue-800 text-blue-300">
                  Hostel Executive Office
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Madras Institute of Technology • 20-Year Institutional Outpass Archive & Oversight
              </p>
            </div>
          </div>

          {/* Academic Year Selection & Export */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs">
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
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Archive (CSV)</span>
            </button>
          </div>
        </div>

        {/* Executive Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-4 border-t border-zinc-800">
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
            <span className="text-[10px] text-zinc-400 uppercase font-mono block">Currently Outside</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-blue-400">{totalInmatesOut}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
            <span className="text-[10px] text-zinc-400 uppercase font-mono block">Ready at Gate</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-400">{totalApproved}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
            <span className="text-[10px] text-zinc-400 uppercase font-mono block">Pending RC</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-zinc-300">{totalPending}</span>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-center">
            <span className="text-[10px] text-zinc-400 uppercase font-mono block">Returned Safely</span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{totalReturned}</span>
          </div>
          <div className={`p-3 rounded-xl border text-center ${
            overdueInmates.length > 0 ? 'bg-red-950/50 border-red-800' : 'bg-zinc-950/60 border-zinc-800'
          }`}>
            <span className="text-[10px] text-zinc-400 uppercase font-mono block">Overdue Inmates</span>
            <span className={`text-xl sm:text-2xl font-black font-mono ${
              overdueInmates.length > 0 ? 'text-red-400 animate-pulse' : 'text-zinc-500'
            }`}>
              {overdueInmates.length}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'OVERVIEW' ? 'border-blue-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Campus Overview & Overdue
        </button>
        <button
          onClick={() => setActiveTab('ROSTER')}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'ROSTER' ? 'border-blue-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Master Outpass Roster ({filteredRequests.length})
        </button>
        <button
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'AUDIT_LOGS' ? 'border-blue-400 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          20-Year Immutable Audit Logs
        </button>
      </div>

      {/* TAB 1: OVERVIEW & OVERDUE */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-5">
          {/* Overdue Alert Banner if any student is late */}
          {overdueInmates.length > 0 && (
            <div className="p-4 rounded-xl bg-red-950/80 border border-red-800 text-red-200 text-xs shadow-lg space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                <h3 className="font-bold text-sm text-white">
                  URGENT: {overdueInmates.length} Inmate(s) Past Mandatory Return Curfew
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                {overdueInmates.map(req => (
                  <div key={req.outpassId} className="p-2.5 rounded bg-zinc-950 border border-red-900/60 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-zinc-100">{req.studentName} ({req.studentRegNo})</p>
                      <p className="text-[11px] text-zinc-400">{req.hostelBlock} Block • Parent: {req.parentPhone}</p>
                    </div>
                    <span className="text-[10px] font-mono text-red-400 font-bold">
                      Due: {formatDate(req.returnDateTime)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Block-wise Breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Hostel Block Inmate Distribution</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {HOSTEL_BLOCKS.map(block => {
                const blockRequests = requests.filter(r => r.hostelBlock === block);
                const outCount = blockRequests.filter(r => r.status === 'OUT_OF_CAMPUS').length;
                const approvedCount = blockRequests.filter(r => r.status === 'APPROVED').length;

                return (
                  <div key={block} className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
                    <p className="text-xs font-bold text-zinc-200">{block}</p>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-[11px] text-zinc-400">Out:</span>
                      <span className="font-mono font-bold text-blue-400">{outCount}</span>
                    </div>
                    <div className="flex items-baseline justify-between text-[11px] text-zinc-500">
                      <span>Gate Ready:</span>
                      <span className="font-mono text-amber-400">{approvedCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MASTER ROSTER */}
      {activeTab === 'ROSTER' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-900/70 p-3 rounded-xl border border-zinc-800">
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

      {/* TAB 3: 20-YEAR IMMUTABLE AUDIT LOGS */}
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
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
