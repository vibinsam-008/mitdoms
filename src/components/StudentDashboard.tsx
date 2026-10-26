import React, { useState } from 'react';
import { UserProfile, OutpassRequest, COMMON_DISEASES } from '../types';
import { createOutpass } from '../firebase/dbService';
import { PrintableOutpassModal } from './PrintableOutpassModal';
import { 
  PlusCircle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  Calendar, 
  QrCode, 
  FileText, 
  AlertCircle,
  Building2,
  Phone,
  User,
  ShieldCheck,
  Send,
  X,
  Activity,
  HeartPulse,
  Stethoscope
} from 'lucide-react';

interface StudentDashboardProps {
  currentUser: UserProfile;
  requests: OutpassRequest[];
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ currentUser, requests }) => {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedOutpassForPrint, setSelectedOutpassForPrint] = useState<OutpassRequest | null>(null);

  // Application Form State
  const [isMedicalLeave, setIsMedicalLeave] = useState(false);
  const [diseaseType, setDiseaseType] = useState<string>('Viral Fever / High Temperature');
  const [customDisease, setCustomDisease] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [hospitalClinic, setHospitalClinic] = useState('MIT Health Centre');
  const [symptoms, setSymptoms] = useState('');

  const [destination, setDestination] = useState('');
  const [visitAddress, setVisitAddress] = useState('');
  const [purpose, setPurpose] = useState('');
  const [proposedDays, setProposedDays] = useState(2);
  const [departureDateTime, setDepartureDateTime] = useState('');
  const [returnDateTime, setReturnDateTime] = useState('');
  const [parentPhone, setParentPhone] = useState(currentUser.parentPhone || '');
  const [declaration, setDeclaration] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccessToast, setSubmitSuccessToast] = useState<string | null>(null);

  // Filter requests belonging to this student (or matching register number)
  const myRequests = requests.filter(
    r => r.studentId === currentUser.id || r.studentRegNo.toUpperCase() === currentUser.uniqueId.toUpperCase()
  );

  const activeRequests = myRequests.filter(r => ['PENDING_RC', 'APPROVED', 'OUT_OF_CAMPUS'].includes(r.status));
  const pastRequests = myRequests.filter(r => ['RETURNED_TO_CAMPUS', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(r.status));

  const handleOpenApply = () => {
    // Defaults: departure 2 hours from now, return 2 days from now
    const now = new Date();
    const defaultDep = new Date(now.getTime() + 2 * 3600000);
    const defaultRet = new Date(now.getTime() + (2 * 24 + 2) * 3600000);

    // Format for datetime-local input YYYY-MM-DDTHH:mm
    const toInputFormat = (d: Date) => {
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setDepartureDateTime(toInputFormat(defaultDep));
    setReturnDateTime(toInputFormat(defaultRet));
    setParentPhone(currentUser.parentPhone || '');
    setIsMedicalLeave(false);
    setDiseaseType('Viral Fever / High Temperature');
    setCustomDisease('');
    setDoctorName('');
    setHospitalClinic('MIT Health Centre');
    setSymptoms('');
    setSubmitError(null);
    setDeclaration(false);
    setShowApplyModal(true);
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim() || !purpose.trim() || !departureDateTime || !returnDateTime) {
      setSubmitError('Please complete all mandatory outpass application fields.');
      return;
    }

    if (!declaration) {
      setSubmitError('Please confirm the parental notification declaration.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const effectiveDisease = diseaseType === 'Other Medical Illness' && customDisease.trim()
      ? customDisease.trim()
      : diseaseType;

    try {
      const res = await createOutpass({
        studentId: currentUser.id,
        studentName: currentUser.name,
        studentRegNo: currentUser.uniqueId,
        hostelBlock: currentUser.hostelBlock || 'Marutham',
        roomNumber: currentUser.roomNumber || 'Room',
        branch: currentUser.branch || 'Engineering',
        year: currentUser.year || 'III',
        studentPhone: currentUser.phone,
        parentPhone: parentPhone || currentUser.parentPhone || '',
        destination: destination.trim(),
        visitAddress: visitAddress.trim() || 'Hometown Residential Address',
        purpose: purpose.trim(),
        category: isMedicalLeave ? 'MEDICAL' : 'GENERAL',
        isMedicalLeave: isMedicalLeave,
        diseaseType: isMedicalLeave ? effectiveDisease : undefined,
        medicalDetails: isMedicalLeave ? {
          diseaseType: effectiveDisease,
          doctorName: doctorName.trim() || 'MIT Medical Officer',
          hospitalClinic: hospitalClinic.trim() || 'MIT Health Centre',
          symptoms: symptoms.trim() || purpose.trim(),
          bedRestDays: Number(proposedDays) || 2
        } : undefined,
        proposedDays: Number(proposedDays) || 1,
        departureDateTime: new Date(departureDateTime).toISOString(),
        returnDateTime: new Date(returnDateTime).toISOString()
      });

      if (res.success && res.outpass) {
        setShowApplyModal(false);
        setDestination('');
        setPurpose('');
        setVisitAddress('');
        setIsMedicalLeave(false);
        setSubmitSuccessToast(
          isMedicalLeave 
            ? `🏥 Medical Holiday Application ${res.outpass.outpassId} (${effectiveDisease}) submitted directly to RC & Executive Warden!`
            : `⚡ Application ${res.outpass.outpassId} dispatched! Delivered in real-time to your Resident Counsellor (RC).`
        );
        setTimeout(() => setSubmitSuccessToast(null), 7000);
      } else {
        setSubmitError(res.error || 'Failed to submit outpass request.');
      }
    } catch {
      setSubmitError('Failed to record outpass in database.');
    } finally {
      setIsSubmitting(false);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_RC':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80 animate-pulse">
            <Clock className="w-3 h-3" /> Under RC Review
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
            <CheckCircle2 className="w-3 h-3" /> Approved • Gate Ready
          </span>
        );
      case 'OUT_OF_CAMPUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/80">
            <MapPin className="w-3 h-3" /> Out of Campus
          </span>
        );
      case 'RETURNED_TO_CAMPUS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
            <CheckCircle2 className="w-3 h-3" /> Safely Returned
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800/80">
            <XCircle className="w-3 h-3" /> Declined
          </span>
        );
      default:
        return <span className="text-xs text-zinc-400">{status}</span>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Instant Success Alert */}
      {submitSuccessToast && (
        <div className="p-4 rounded-xl bg-emerald-950/90 border border-emerald-600 text-emerald-200 text-xs flex items-center justify-between shadow-xl animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-sm text-white">{submitSuccessToast}</span>
          </div>
          <button onClick={() => setSubmitSuccessToast(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Student Profile Card & Action Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center font-bold text-lg text-zinc-100 shadow-inner shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {currentUser.name}
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-zinc-950 border border-zinc-800 text-zinc-300">
                  {currentUser.uniqueId}
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
                  Verified Inmate
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{currentUser.hostelBlock} Block • Room {currentUser.roomNumber}</span>
                <span>•</span>
                <span>{currentUser.branch} ({currentUser.year} Year)</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto">
            <button
              onClick={handleOpenApply}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-zinc-950" />
              <span>Apply for Digital Outpass</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Outpass Requests */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Active Outpass Applications</span>
            <span className="px-2 py-0.5 text-xs font-mono bg-zinc-800 rounded-full text-zinc-300">
              {activeRequests.length}
            </span>
          </h2>
          <span className="text-xs text-zinc-400 font-mono hidden sm:inline">
            Real-time updates synced with RC & Gatekeeper
          </span>
        </div>

        {activeRequests.length === 0 ? (
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-8 text-center">
            <FileText className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-300">No Active Outpass Applications</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              You currently do not have any pending or active leave permits. Tap "Apply for Digital Outpass" whenever you plan to leave campus.
            </p>
            <button
              onClick={handleOpenApply}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Submit Leave Request</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeRequests.map((req) => (
              <div
                key={req.outpassId}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4 hover:border-zinc-700 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-zinc-400">{req.outpassId}</span>
                    <h3 className="text-base font-bold text-white mt-0.5">{req.destination}</h3>
                  </div>
                  <div>{getStatusBadge(req.status)}</div>
                </div>

                {/* Medical Leave Indicator if applicable */}
                {(req.isMedicalLeave || req.category === 'MEDICAL') && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/60 border border-red-800/80 text-xs text-red-200">
                    <HeartPulse className="w-4 h-4 text-red-400 shrink-0" />
                    <div>
                      <span className="font-bold text-red-300">Medical Holiday Application: </span>
                      <span className="font-medium text-white">{req.diseaseType || req.medicalDetails?.diseaseType || 'Medical Illness'}</span>
                      {req.medicalDetails?.hospitalClinic && (
                        <p className="text-[11px] text-red-400 mt-0.5">Clinic: {req.medicalDetails.hospitalClinic}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Purpose & Details */}
                <p className="text-xs text-zinc-300 bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/70">
                  <span className="text-zinc-500 font-medium">Purpose: </span>
                  {req.purpose}
                </p>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono block">Departure</span>
                    <span className="font-semibold text-zinc-200">{formatDate(req.departureDateTime)}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono block">Expected Return</span>
                    <span className="font-semibold text-zinc-200">{formatDate(req.returnDateTime)}</span>
                  </div>
                </div>

                {/* RC Endorsement info if available */}
                {req.rcDecision && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">RC Approved: {req.rcDecision.rcName}</p>
                      <p className="text-[11px] text-emerald-400/80 mt-0.5">"{req.rcDecision.remarks}"</p>
                    </div>
                  </div>
                )}

                {/* Action button */}
                <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
                  <span className="text-[11px] font-mono text-zinc-500">
                    Applied: {formatDate(req.createdAt)}
                  </span>

                  {req.status === 'APPROVED' || req.status === 'OUT_OF_CAMPUS' ? (
                    <button
                      onClick={() => setSelectedOutpassForPrint(req)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow transition-all active:scale-95"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>View Pass & Gate QR</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setSelectedOutpassForPrint(req)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>View Form</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historical Outpass Records */}
      {pastRequests.length > 0 && (
        <div className="pt-4 border-t border-zinc-800">
          <h2 className="text-base font-bold text-zinc-300 mb-3 flex items-center gap-2">
            <span>Past Outpass History</span>
            <span className="text-xs font-mono text-zinc-500">({pastRequests.length})</span>
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Pass ID</th>
                    <th className="py-3 px-4">Destination</th>
                    <th className="py-3 px-4">Departure</th>
                    <th className="py-3 px-4">Return</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {pastRequests.map(r => (
                    <tr key={r.outpassId} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-zinc-200">{r.outpassId}</td>
                      <td className="py-3 px-4 text-zinc-300 font-medium">{r.destination}</td>
                      <td className="py-3 px-4 text-zinc-400">{formatDate(r.departureDateTime)}</td>
                      <td className="py-3 px-4 text-zinc-400">{formatDate(r.returnDateTime)}</td>
                      <td className="py-3 px-4">{getStatusBadge(r.status)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedOutpassForPrint(r)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs"
                        >
                          Certificate
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

      {/* New Application Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  New Digital Outpass Application
                </h3>
                <p className="text-xs text-zinc-400">
                  MIT Campus Hostels • Inmate Leave Clearance
                </p>
              </div>
              <button
                onClick={() => setShowApplyModal(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitError && (
              <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleApplySubmit} className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Type of Outpass Application
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMedicalLeave(false);
                      if (purpose.startsWith('Medical Leave:')) setPurpose('');
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      !isMedicalLeave
                        ? 'bg-zinc-800 text-white border-zinc-600 shadow'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>General Outpass</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMedicalLeave(true);
                      if (!purpose) setPurpose(`Medical Leave: Under treatment for ${diseaseType}. Advised rest and care.`);
                    }}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      isMedicalLeave
                        ? 'bg-red-950 text-red-200 border-red-700 shadow'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <HeartPulse className="w-3.5 h-3.5 text-red-400" />
                    <span>🏥 Medical Holiday / Sick Leave</span>
                  </button>
                </div>
              </div>

              {/* Medical Specific Fields */}
              {isMedicalLeave && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/70 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-300">
                    <Stethoscope className="w-4 h-4 text-red-400" />
                    <span>Medical Holiday Details (Direct Notification to Executive Warden)</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-200 mb-1">
                      Type of Disease / Medical Condition <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={diseaseType}
                      onChange={(e) => {
                        setDiseaseType(e.target.value);
                        setPurpose(`Medical Leave: Under treatment for ${e.target.value}. Advised home recovery.`);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-red-800/80 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-red-500 font-medium"
                      required
                    >
                      {COMMON_DISEASES.map(d => (
                        <option key={d} value={d} className="bg-zinc-900 text-white">{d}</option>
                      ))}
                    </select>
                  </div>

                  {diseaseType === 'Other Medical Illness' && (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-200 mb-1">
                        Specify Disease / Condition Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={customDisease}
                        onChange={(e) => setCustomDisease(e.target.value)}
                        placeholder="e.g., Bronchitis, Severe Sinusitis, Dental Surgery"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-red-500"
                        required
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-200 mb-1">
                        Attending Doctor Name
                      </label>
                      <input
                        type="text"
                        value={doctorName}
                        onChange={(e) => setDoctorName(e.target.value)}
                        placeholder="e.g., Dr. R. Sundar, M.D."
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-200 mb-1">
                        Hospital / Health Centre
                      </label>
                      <input
                        type="text"
                        value={hospitalClinic}
                        onChange={(e) => setHospitalClinic(e.target.value)}
                        placeholder="e.g., MIT Health Centre, Chromepet"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Destination */}
              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1">
                  Place of Visit / Destination <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g., Tiruchirappalli (Hometown) or Madurai"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1">
                  Purpose of Leave <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g., Weekend hometown visit and family religious function"
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
                  required
                />
              </div>

              {/* Stay Address */}
              <div>
                <label className="block text-xs font-semibold text-zinc-200 mb-1">
                  Address During Visit <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={visitAddress}
                  onChange={(e) => setVisitAddress(e.target.value)}
                  placeholder="e.g., 14/B, Salai Road, Thillai Nagar, Tiruchirappalli - 620018"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              {/* Schedule: Departure & Return */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1">
                    Departure Date & Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={departureDateTime}
                    onChange={(e) => setDepartureDateTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1">
                    Expected Return Date & Time <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={returnDateTime}
                    onChange={(e) => setReturnDateTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Proposed Days & Parent Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1">
                    Proposed Leave Duration (Days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={proposedDays}
                    onChange={(e) => setProposedDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-200 mb-1">
                    Parent Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="+91 94441 98765"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                    required
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">RC will call this number for verification</p>
                </div>
              </div>

              {/* Inmate Declaration */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={declaration}
                    onChange={(e) => setDeclaration(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-zinc-300 leading-relaxed">
                    I declare that the destination and purpose entered above are authentic. My parents have consented to this trip. I will strictly adhere to campus hostel bylaws and report back before curfew.
                  </span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Outpass Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Certificate Modal */}
      {selectedOutpassForPrint && (
        <PrintableOutpassModal
          outpass={selectedOutpassForPrint}
          onClose={() => setSelectedOutpassForPrint(null)}
        />
      )}
    </div>
  );
};
