import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  HolidayPeriod, 
  HolidayDeclaration, 
  DailyMealRequirement, 
  MessPlanningReport,
  HOSTEL_BLOCKS 
} from '../types';
import { 
  getHolidayPeriods, 
  getStudentHolidayDeclaration, 
  submitHolidayDeclaration, 
  calculateMessPlanningReport,
  generateDateRangeList,
  playNotificationChime,
  DEFAULT_HOLIDAY_PERIODS
} from '../firebase/dbService';
import { 
  Utensils, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Users, 
  Download, 
  Clock, 
  Coffee, 
  Sun, 
  Moon, 
  Building2, 
  Check, 
  X, 
  RefreshCw, 
  FileText,
  HelpCircle,
  ChevronRight,
  Info
} from 'lucide-react';

interface HolidayMessModuleProps {
  currentUser: UserProfile;
  onNavigateToEW?: () => void;
}

export const HolidayMessModule: React.FC<HolidayMessModuleProps> = ({ currentUser }) => {
  const isStaffOrWarden = ['EW', 'MESS_STAFF', 'RC', 'ADMIN'].includes(currentUser.role);

  // Periods State
  const [periods, setPeriods] = useState<HolidayPeriod[]>(DEFAULT_HOLIDAY_PERIODS);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('deepavali-2026');
  const [isLoadingPeriods, setIsLoadingPeriods] = useState(false);

  // Student Declaration Form State
  const [existingDeclaration, setExistingDeclaration] = useState<HolidayDeclaration | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [stayingInHostel, setStayingInHostel] = useState<boolean>(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [mealsByDate, setMealsByDate] = useState<Record<string, DailyMealRequirement>>({});
  const [operationalNotes, setOperationalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMsg, setSubmitSuccessMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Staff Mess Report State
  const [messReport, setMessReport] = useState<MessPlanningReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportViewTab, setReportViewTab] = useState<'DAILY_COUNTS' | 'NON_RESPONDENTS' | 'BLOCK_MATRIX'>('DAILY_COUNTS');
  const [selectedBlockBreakdownDate, setSelectedBlockBreakdownDate] = useState<string | null>(null);

  // Active Holiday Period Object
  const currentPeriod = periods.find(p => p.id === selectedPeriodId) || periods[0] || DEFAULT_HOLIDAY_PERIODS[0];

  // Load periods on mount
  useEffect(() => {
    setIsLoadingPeriods(true);
    getHolidayPeriods()
      .then(data => {
        if (data.length > 0) {
          setPeriods(data);
          if (!data.some(p => p.id === selectedPeriodId)) {
            setSelectedPeriodId(data[0].id);
          }
        }
      })
      .finally(() => setIsLoadingPeriods(false));
  }, []);

  // If Student: Load Student's Existing Declaration for selected period
  useEffect(() => {
    if (currentUser.role === 'STUDENT' && currentPeriod) {
      getStudentHolidayDeclaration(currentUser.uniqueId, currentPeriod.id).then(dec => {
        setExistingDeclaration(dec);
        if (dec) {
          setStayingInHostel(dec.stayingInHostel);
          setSelectedDates(dec.presenceDates || []);
          setMealsByDate(dec.mealsByDate || {});
          setOperationalNotes(dec.operationalNotes || '');
          setIsEditing(false);
        } else {
          // Fresh form defaults
          setStayingInHostel(false);
          setSelectedDates([]);
          setMealsByDate({});
          setOperationalNotes('');
          setIsEditing(true);
        }
        setSubmitSuccessMsg(null);
        setFormError(null);
      });
    }
  }, [currentUser, selectedPeriodId, currentPeriod]);

  // If Staff / Warden: Load Mess Planning Report
  useEffect(() => {
    if (isStaffOrWarden && currentPeriod) {
      loadMessReport();
    }
  }, [isStaffOrWarden, selectedPeriodId, currentPeriod]);

  const loadMessReport = async () => {
    setIsLoadingReport(true);
    try {
      // First try fetching from authorized server endpoint
      const res = await fetch(`/api/mess/reports?periodId=${currentPeriod.id}`, {
        headers: {
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.uniqueId,
          'x-user-name': currentUser.name
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMessReport(data);
        return;
      }
    } catch {
      // Fallback to dbService calculation
    }

    try {
      const data = await calculateMessPlanningReport(currentPeriod.id);
      setMessReport(data);
    } catch (e) {
      console.error('Error generating mess report', e);
    } finally {
      setIsLoadingReport(false);
    }
  };

  // Helper date list for the current period
  const periodDatesList = currentPeriod 
    ? generateDateRangeList(currentPeriod.startDate, currentPeriod.endDate)
    : [];

  // Deadline check
  const isPastDeadline = currentPeriod 
    ? Date.now() > new Date(currentPeriod.submissionDeadline).getTime()
    : false;

  // Student toggle a presence date
  const handleToggleDate = (dateStr: string) => {
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(prev => prev.filter(d => d !== dateStr));
      setMealsByDate(prev => {
        const copy = { ...prev };
        delete copy[dateStr];
        return copy;
      });
    } else {
      setSelectedDates(prev => [...prev, dateStr].sort());
      setMealsByDate(prev => ({
        ...prev,
        [dateStr]: { breakfast: true, lunch: true, dinner: true }
      }));
    }
  };

  // Student toggle specific meal for a date
  const handleToggleMeal = (dateStr: string, meal: 'breakfast' | 'lunch' | 'dinner') => {
    setMealsByDate(prev => {
      const current = prev[dateStr] || { breakfast: true, lunch: true, dinner: true };
      return {
        ...prev,
        [dateStr]: {
          ...current,
          [meal]: !current[meal]
        }
      };
    });
  };

  // Student select all meals for all selected dates
  const handleSelectAllMeals = () => {
    const updated: Record<string, DailyMealRequirement> = {};
    periodDatesList.forEach(d => {
      updated[d] = { breakfast: true, lunch: true, dinner: true };
    });
    setSelectedDates([...periodDatesList]);
    setMealsByDate(updated);
  };

  // Student Submit Declaration
  const handleSubmitDeclaration = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitSuccessMsg(null);

    if (stayingInHostel && selectedDates.length === 0) {
      setFormError('Please select at least one date when you will be present in the hostel.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Try server endpoint
      const serverRes = await fetch('/api/holiday/declarations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.uniqueId,
          'x-user-name': currentUser.name
        },
        body: JSON.stringify({
          periodId: currentPeriod.id,
          studentId: currentUser.id,
          studentRegNo: currentUser.uniqueId,
          studentName: currentUser.name,
          hostelBlock: currentUser.hostelBlock || 'Unassigned',
          roomNumber: currentUser.roomNumber || 'N/A',
          stayingInHostel,
          presenceDates: selectedDates,
          mealsByDate,
          operationalNotes
        })
      });

      if (serverRes.ok) {
        const data = await serverRes.json();
        setExistingDeclaration(data.declaration);
        setIsEditing(false);
        setSubmitSuccessMsg(data.isUpdate ? 'Holiday declaration successfully updated!' : 'Holiday declaration successfully submitted!');
        playNotificationChime();
        return;
      }
    } catch {
      // Server offline, fall back to Firestore service
    }

    // 2. Direct Firestore fallback
    const result = await submitHolidayDeclaration(
      {
        studentId: currentUser.id,
        studentRegNo: currentUser.uniqueId,
        studentName: currentUser.name,
        hostelBlock: currentUser.hostelBlock || 'Unassigned',
        roomNumber: currentUser.roomNumber || 'N/A',
        periodId: currentPeriod.id,
        stayingInHostel,
        presenceDates: selectedDates,
        mealsByDate,
        operationalNotes
      },
      currentUser
    );

    setIsSubmitting(false);

    if (result.success && result.declaration) {
      setExistingDeclaration(result.declaration);
      setIsEditing(false);
      setSubmitSuccessMsg('Holiday declaration successfully recorded in institutional register!');
      playNotificationChime();
    } else {
      setFormError(result.error || 'Failed to submit declaration. Please try again.');
    }
  };

  // Staff Export CSV
  const handleExportCSV = async () => {
    try {
      const res = await fetch(`/api/mess/export?periodId=${currentPeriod.id}`, {
        headers: {
          'x-user-role': currentUser.role,
          'x-user-id': currentUser.uniqueId
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MIT_Mess_Plan_${currentPeriod.id}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
    } catch {
      // Client-side fallback CSV generator
    }

    if (!messReport) return;
    const header = ['Date', 'Expected Hostel Occupancy', 'Breakfast Count', 'Lunch Count', 'Dinner Count'];
    const rows = messReport.dailyReports.map(d => [
      d.date,
      d.expectedOccupancy,
      d.breakfastCount,
      d.lunchCount,
      d.dinnerCount
    ].join(','));

    const csvContent = 'data:text/csv;charset=utf-8,' + [
      `# MIT Hostels - Mess Food Count & Occupancy Estimate`,
      `# Period: ${currentPeriod.name}`,
      `# Generated: ${new Date().toISOString()}`,
      `# ${messReport.disclaimer}`,
      '',
      header.join(','),
      ...rows
    ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MIT_Hostel_Mess_Plan_${currentPeriod.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateLabel = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Institutional Module Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-amber-950/80 border border-amber-700/80 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-950/40">
              <Utensils className="w-7 h-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Holiday Hostel & Mess Count
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  Institutional Catering Matrix
                </span>
                {isPastDeadline && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                    Submission Window Closed
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Madras Institute of Technology Hostels • Zero Food Wastage & Accurate Kitchen Headcount Planning
              </p>
            </div>
          </div>

          {/* Holiday Period Selector & Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span className="text-zinc-400 font-mono">Select Period:</span>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="bg-transparent text-white font-mono font-bold focus:outline-none cursor-pointer"
              >
                {periods.map(p => (
                  <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {isStaffOrWarden && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Mess CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Selected Period Information Card */}
        {currentPeriod && (
          <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Holiday Dates</span>
              <span className="text-white font-mono font-bold text-sm">
                {currentPeriod.startDate} → {currentPeriod.endDate}
              </span>
              <span className="text-zinc-400 text-[11px] block mt-0.5">
                ({periodDatesList.length} days total vacation duration)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Declaration Deadline</span>
              <span className={`font-mono font-bold text-sm ${isPastDeadline ? 'text-red-400' : 'text-emerald-400'}`}>
                {new Date(currentPeriod.submissionDeadline).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span className="text-zinc-400 text-[11px] block mt-0.5">
                {isPastDeadline ? 'Deadline has expired' : 'Strict cutoff for kitchen provisioning'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[10px] uppercase font-mono text-zinc-400 block">Policy Note</span>
              <p className="text-zinc-300 text-[11px] line-clamp-2">
                {currentPeriod.description || 'Mandatory declaration required for hostel stay & meal catering.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION A: STUDENT SUBMISSION & REVIEW FORM */}
      {/* ========================================================================= */}
      {currentUser.role === 'STUDENT' && (
        <div className="space-y-5">
          {/* Success Banner */}
          {submitSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700 text-emerald-200 flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{submitSuccessMsg}</span>
              </div>
              <button 
                onClick={() => setSubmitSuccessMsg(null)}
                className="text-xs text-emerald-400 hover:text-white font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Form Error */}
          {formError && (
            <div className="p-4 rounded-xl bg-red-950/80 border border-red-700 text-red-200 flex items-center gap-2 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Existing Declaration Summary View (Readonly when not in edit mode) */}
          {existingDeclaration && !isEditing ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Your Recorded Holiday Declaration
                    </h2>
                    <p className="text-xs text-zinc-400">
                      Submitted: {new Date(existingDeclaration.submittedAt).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                      {existingDeclaration.updatedAt !== existingDeclaration.submittedAt && ` • Updated: ${new Date(existingDeclaration.updatedAt).toLocaleTimeString('en-IN')}`}
                    </p>
                  </div>
                </div>

                {!isPastDeadline ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs border border-zinc-700 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Update Declaration</span>
                  </button>
                ) : (
                  <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800">
                    Locked (Deadline Passed)
                  </span>
                )}
              </div>

              {/* Student Details Pre-filled Display */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80">
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">STUDENT NAME</span>
                  <span className="font-bold text-white">{currentUser.name}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">REGISTER NUMBER</span>
                  <span className="font-mono text-blue-300 font-bold">{currentUser.uniqueId}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">HOSTEL BLOCK</span>
                  <span className="text-zinc-200">{currentUser.hostelBlock} Block</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">ROOM NUMBER</span>
                  <span className="text-emerald-300 font-bold">{currentUser.roomNumber}</span>
                </div>
              </div>

              {/* Decision Summary Card */}
              <div className={`p-4 rounded-xl border ${
                existingDeclaration.stayingInHostel 
                  ? 'bg-amber-950/30 border-amber-800/70 text-amber-200' 
                  : 'bg-blue-950/30 border-blue-800/70 text-blue-200'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {existingDeclaration.stayingInHostel ? (
                    <>
                      <Building2 className="w-4 h-4 text-amber-400" />
                      <span>Staying in Hostel during {currentPeriod.name}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                      <span>Leaving Hostel / Staying at Home during {currentPeriod.name}</span>
                    </>
                  )}
                </div>
                <p className="text-xs mt-1 text-zinc-300">
                  {existingDeclaration.stayingInHostel 
                    ? `You have declared presence on ${existingDeclaration.presenceDates.length} day(s). Kitchen catering has been booked accordingly.`
                    : 'Zero meals booked. You have notified mess catering that you will not be dining during this holiday.'}
                </p>
              </div>

              {/* Meal Requirement Breakdown Table if staying */}
              {existingDeclaration.stayingInHostel && existingDeclaration.presenceDates.length > 0 && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow">
                  <div className="p-3 bg-zinc-900 border-b border-zinc-800 text-xs font-bold text-white">
                    Booked Meal Schedule per Date
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900/60 text-zinc-400 font-mono border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3 text-center">Breakfast</th>
                          <th className="py-2.5 px-3 text-center">Lunch</th>
                          <th className="py-2.5 px-3 text-center">Dinner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                        {existingDeclaration.presenceDates.map(date => {
                          const meals = existingDeclaration.mealsByDate[date] || { breakfast: true, lunch: true, dinner: true };
                          return (
                            <tr key={date} className="hover:bg-zinc-900/40">
                              <td className="py-2.5 px-3 font-mono font-bold text-white">
                                {formatDateLabel(date)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {meals.breakfast ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                                    <Check className="w-3 h-3" /> Yes
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-zinc-500 font-mono">No</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {meals.lunch ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                                    <Check className="w-3 h-3" /> Yes
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-zinc-500 font-mono">No</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {meals.dinner ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
                                    <Check className="w-3 h-3" /> Yes
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-zinc-500 font-mono">No</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Operational notes */}
              {existingDeclaration.operationalNotes && (
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
                  <span className="text-zinc-500 block text-[10px] font-mono">OPERATIONAL NOTES</span>
                  <p className="text-zinc-300 mt-0.5">{existingDeclaration.operationalNotes}</p>
                </div>
              )}
            </div>
          ) : (
            /* Editable Declaration Submission Form */
            <form onSubmit={handleSubmitDeclaration} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <Utensils className="w-5 h-5 text-amber-400" />
                    <span>{existingDeclaration ? 'Update Your Holiday Declaration' : 'Submit Holiday Presence Declaration'}</span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Single declaration enforced per student and holiday period. Updates will modify your existing record.
                  </p>
                </div>

                {existingDeclaration && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="self-start text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    Cancel Editing
                  </button>
                )}
              </div>

              {/* Student Identity Verification (Populated from Account) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">STUDENT NAME</span>
                  <span className="font-bold text-white">{currentUser.name}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">REGISTER NUMBER</span>
                  <span className="font-mono text-blue-300 font-bold">{currentUser.uniqueId}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">HOSTEL BLOCK</span>
                  <span className="text-zinc-200">{currentUser.hostelBlock || 'Thamirabarani'} Block</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] font-mono">ROOM NUMBER</span>
                  <span className="text-emerald-300 font-bold">{currentUser.roomNumber || '6206'}</span>
                </div>
              </div>

              {/* Question 1: Will you be staying in the hostel? */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-zinc-200 block">
                  Will you be staying in the hostel during {currentPeriod.name}? <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStayingInHostel(true)}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      stayingInHostel 
                        ? 'bg-amber-950/60 border-amber-500 shadow-md ring-1 ring-amber-500' 
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">Yes, I will stay in the hostel</span>
                      {stayingInHostel && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      I require accommodation and mess catering for one or more dates.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStayingInHostel(false);
                      setSelectedDates([]);
                      setMealsByDate({});
                    }}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      !stayingInHostel 
                        ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-500' 
                        : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">No, I will be away / going home</span>
                      {!stayingInHostel && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      I will travel to my native place. Zero mess meals will be booked.
                    </p>
                  </button>
                </div>
              </div>

              {/* Question 2: Expected Dates & Meal Requirements (Conditional on Staying) */}
              {stayingInHostel && (
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <label className="text-xs font-bold text-white block">
                        Select Presence Dates & Meal Requirements <span className="text-red-400">*</span>
                      </label>
                      <p className="text-[11px] text-zinc-400">
                        Check the dates you will be physically present, then choose breakfast, lunch, and dinner.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSelectAllMeals}
                      className="self-start sm:self-auto text-xs font-mono font-bold text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 hover:border-zinc-700 cursor-pointer"
                    >
                      ✓ Select All Dates & Meals
                    </button>
                  </div>

                  {/* Dates Matrix */}
                  <div className="space-y-2">
                    {periodDatesList.map(dateStr => {
                      const isSelected = selectedDates.includes(dateStr);
                      const meals = mealsByDate[dateStr] || { breakfast: true, lunch: true, dinner: true };

                      return (
                        <div
                          key={dateStr}
                          className={`p-3 rounded-xl border transition-all ${
                            isSelected 
                              ? 'bg-zinc-950 border-amber-800/80' 
                              : 'bg-zinc-950/50 border-zinc-800/60 opacity-70'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleDate(dateStr)}
                                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                              />
                              <span className="font-mono font-bold text-xs sm:text-sm text-white">
                                {formatDateLabel(dateStr)}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">({dateStr})</span>
                            </label>

                            {/* Meal Checkboxes */}
                            {isSelected ? (
                              <div className="flex items-center gap-2 pl-6 sm:pl-0">
                                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                                  <input
                                    type="checkbox"
                                    checked={meals.breakfast}
                                    onChange={() => handleToggleMeal(dateStr, 'breakfast')}
                                    className="accent-amber-500 rounded"
                                  />
                                  <Coffee className="w-3 h-3 text-amber-400" />
                                  <span>Breakfast</span>
                                </label>

                                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                                  <input
                                    type="checkbox"
                                    checked={meals.lunch}
                                    onChange={() => handleToggleMeal(dateStr, 'lunch')}
                                    className="accent-amber-500 rounded"
                                  />
                                  <Sun className="w-3 h-3 text-amber-400" />
                                  <span>Lunch</span>
                                </label>

                                <label className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700">
                                  <input
                                    type="checkbox"
                                    checked={meals.dinner}
                                    onChange={() => handleToggleMeal(dateStr, 'dinner')}
                                    className="accent-amber-500 rounded"
                                  />
                                  <Moon className="w-3 h-3 text-amber-400" />
                                  <span>Dinner</span>
                                </label>
                              </div>
                            ) : (
                              <span className="text-[11px] font-mono text-zinc-500 pl-6 sm:pl-0">
                                Not in hostel on this date
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Question 3: Optional Operational Notes (Privacy safe) */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300">
                    Optional Operational Remarks (Kitchen / Hostels)
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500">Max 300 chars</span>
                </div>
                <textarea
                  value={operationalNotes}
                  onChange={(e) => setOperationalNotes(e.target.value)}
                  placeholder="e.g., Arriving by train on Nov 8 afternoon; leaving after breakfast on Nov 10. Do not submit personal or medical details."
                  maxLength={300}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Info className="w-3 h-3 text-zinc-400" />
                  <span>Strict Privacy Discipline: Please do NOT include medical conditions or personal diagnoses here.</span>
                </p>
              </div>

              {/* Form Submission Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="submit"
                  disabled={isSubmitting || isPastDeadline}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-black text-xs sm:text-sm shadow-lg transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSubmitting 
                      ? 'Recording Declaration...' 
                      : existingDeclaration 
                        ? 'Save & Update Declaration' 
                        : 'Submit Official Declaration'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION B: MESS PLANNING & HEADCOUNT DASHBOARD (Authorized Staff & EW) */}
      {/* ========================================================================= */}
      {isStaffOrWarden && (
        <div className="space-y-6">
          {/* Staff Metric Cards */}
          {messReport && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {/* Card 1: Expected Students Staying */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/40 to-zinc-950 border border-amber-800/60 shadow">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  Hostel Stay Declarations
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-white">
                    {messReport.dailyReports.reduce((max, d) => Math.max(max, d.expectedOccupancy), 0)}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">Peak Inmates</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Declared staying in campus</p>
              </div>

              {/* Card 2: Total Breakfasts Required */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 shadow">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1">
                  <Coffee className="w-3.5 h-3.5" />
                  Total Breakfasts
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
                    {messReport.dailyReports.reduce((acc, d) => acc + d.breakfastCount, 0)}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">Meals</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Across entire holiday period</p>
              </div>

              {/* Card 3: Total Lunches Required */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 shadow">
                <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider font-mono flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5" />
                  Total Lunches
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-orange-400">
                    {messReport.dailyReports.reduce((acc, d) => acc + d.lunchCount, 0)}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">Meals</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Full meals catered</p>
              </div>

              {/* Card 4: Total Dinners Required */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 shadow">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5" />
                  Total Dinners
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-indigo-400">
                    {messReport.dailyReports.reduce((acc, d) => acc + d.dinnerCount, 0)}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">Meals</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Night mess servings</p>
              </div>

              {/* Card 5: Response Rate & Non-Respondents */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 to-zinc-950 border border-blue-800/60 shadow">
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Declaration Rate
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                    {messReport.totalSubmissions}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">/ {messReport.totalRegisteredStudents} registered</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {messReport.nonRespondentsCount} students pending response
                </p>
              </div>
            </div>
          )}

          {/* Official Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-amber-800/60 text-xs text-amber-300/90 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-white">Official Kitchen Planning Disclaimer:</span>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                Reports reflect planning estimates compiled from verified student submissions as of{' '}
                <span className="font-mono text-zinc-300">{new Date(messReport?.lastUpdated || Date.now()).toLocaleTimeString('en-IN')}</span>. 
                Students who have not yet responded are tracked as pending. In accordance with institutional protocol,{' '}
                <span className="text-amber-200 font-semibold">non-respondents are NOT assumed to be either present or absent</span>.
              </p>
            </div>
          </div>

          {/* Staff Tabs: Daily Counts vs Block Breakdown vs Non-Respondents */}
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
            <button
              onClick={() => setReportViewTab('DAILY_COUNTS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportViewTab === 'DAILY_COUNTS' 
                  ? 'bg-amber-500 text-zinc-950 shadow' 
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Daily Meal Projections
            </button>

            <button
              onClick={() => setReportViewTab('BLOCK_MATRIX')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportViewTab === 'BLOCK_MATRIX' 
                  ? 'bg-amber-500 text-zinc-950 shadow' 
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Hostel Block Breakdown
            </button>

            <button
              onClick={() => setReportViewTab('NON_RESPONDENTS')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                reportViewTab === 'NON_RESPONDENTS' 
                  ? 'bg-amber-500 text-zinc-950 shadow' 
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Pending Non-Respondents ({messReport?.nonRespondentsCount || 0})
            </button>
          </div>

          {/* TAB 1: Daily Meal Counts Table */}
          {reportViewTab === 'DAILY_COUNTS' && messReport && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white">
                    {currentPeriod.name} — Daily Headcount & Food Quantity Estimates
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Kitchen provisioning matrix across each day of the vacation
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 text-zinc-400 font-mono border-b border-zinc-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Expected Occupancy</th>
                      <th className="py-3 px-4">Breakfast Count</th>
                      <th className="py-3 px-4">Lunch Count</th>
                      <th className="py-3 px-4">Dinner Count</th>
                      <th className="py-3 px-4 text-right">Block Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                    {messReport.dailyReports.map(day => (
                      <tr key={day.date} className="hover:bg-zinc-900/40">
                        <td className="py-3 px-4 font-mono font-bold text-white text-xs sm:text-sm">
                          {formatDateLabel(day.date)}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-white text-sm bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700">
                            {day.expectedOccupancy} Inmates
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-amber-400 text-sm">
                            {day.breakfastCount}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono block">plates</span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-orange-400 text-sm">
                            {day.lunchCount}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono block">meals</span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-indigo-400 text-sm">
                            {day.dinnerCount}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono block">servings</span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedBlockBreakdownDate(day.date);
                              setReportViewTab('BLOCK_MATRIX');
                            }}
                            className="text-xs font-mono text-amber-400 hover:underline cursor-pointer"
                          >
                            Inspect Blocks →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Block Breakdown Matrix */}
          {reportViewTab === 'BLOCK_MATRIX' && messReport && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Hostel Block Occupancy & Dining Distribution
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Distribution of declared staying students across 11 MIT hostel blocks
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-mono">Date:</span>
                  <select
                    value={selectedBlockBreakdownDate || messReport.dailyReports[0]?.date || ''}
                    onChange={(e) => setSelectedBlockBreakdownDate(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 text-white font-mono rounded px-2.5 py-1"
                  >
                    {messReport.dailyReports.map(d => (
                      <option key={d.date} value={d.date}>
                        {formatDateLabel(d.date)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Block Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {HOSTEL_BLOCKS.map(block => {
                  const activeDate = selectedBlockBreakdownDate || messReport.dailyReports[0]?.date;
                  const dayData = messReport.dailyReports.find(d => d.date === activeDate);
                  const blockStats = dayData?.blockBreakdown[block] || { occupancy: 0, breakfast: 0, lunch: 0, dinner: 0 };

                  return (
                    <div key={block} className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-xs sm:text-sm">{block} Block</span>
                        <span className="font-mono text-xs text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                          {blockStats.occupancy} staying
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-center pt-2 border-t border-zinc-800">
                        <div className="p-1 rounded bg-zinc-950">
                          <span className="text-[10px] text-zinc-500 block">BF</span>
                          <span className="font-bold text-zinc-300">{blockStats.breakfast}</span>
                        </div>
                        <div className="p-1 rounded bg-zinc-950">
                          <span className="text-[10px] text-zinc-500 block">LUN</span>
                          <span className="font-bold text-zinc-300">{blockStats.lunch}</span>
                        </div>
                        <div className="p-1 rounded bg-zinc-950">
                          <span className="text-[10px] text-zinc-500 block">DIN</span>
                          <span className="font-bold text-zinc-300">{blockStats.dinner}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Non-Respondents Tracking Table */}
          {reportViewTab === 'NON_RESPONDENTS' && messReport && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Students Pending Declaration Response ({messReport.nonRespondentsCount})
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Use this roster for floor representative follow-up. Do not assume presence or absence.
                  </p>
                </div>
              </div>

              {messReport.nonRespondents.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400 bg-zinc-900 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="font-bold text-white">100% Submission Response Achieved</p>
                  <p className="text-zinc-500">Every registered inmate has submitted their holiday plan.</p>
                </div>
              ) : (
                <div className="overflow-x-auto bg-zinc-900 rounded-xl border border-zinc-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950 text-zinc-400 font-mono border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Register Number</th>
                        <th className="py-2.5 px-3">Student Name</th>
                        <th className="py-2.5 px-3">Hostel Block</th>
                        <th className="py-2.5 px-3">Room</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-200">
                      {messReport.nonRespondents.map(s => (
                        <tr key={s.studentRegNo} className="hover:bg-zinc-950/40">
                          <td className="py-2.5 px-3 font-mono text-blue-300 font-bold">{s.studentRegNo}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{s.studentName}</td>
                          <td className="py-2.5 px-3">{s.hostelBlock} Block</td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300 font-bold">{s.roomNumber}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                              Pending Declaration
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
