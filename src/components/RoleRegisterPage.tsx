import React, { useState } from 'react';
import { Role, UserProfile, HOSTEL_BLOCKS, BRANCHES, GATE_LOCATIONS } from '../types';
import { registerUser, checkIfUniqueIdExists } from '../firebase/dbService';
import { 
  GraduationCap, 
  ShieldCheck, 
  Building2, 
  KeyRound, 
  ArrowLeft, 
  UserPlus, 
  AlertCircle, 
  CheckCircle2, 
  Lock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface RoleRegisterPageProps {
  role: Role;
  onRegisterSuccess: (user: UserProfile) => void;
  onGoToLogin: () => void;
  onBackToRoles: () => void;
}

export const RoleRegisterPage: React.FC<RoleRegisterPageProps> = ({
  role,
  onRegisterSuccess,
  onGoToLogin,
  onBackToRoles
}) => {
  // Form fields
  const [uniqueId, setUniqueId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hostelBlock, setHostelBlock] = useState<string>(HOSTEL_BLOCKS[0]);
  const [roomNumber, setRoomNumber] = useState('');
  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [year, setYear] = useState<string>('III');
  const [parentPhone, setParentPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [gateLocation, setGateLocation] = useState<string>(GATE_LOCATIONS[0]);
  const [designation, setDesignation] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status
  const [isCheckingId, setIsCheckingId] = useState(false);
  const [idDuplicateError, setIdDuplicateError] = useState<string | null>(null);
  const [idAvailableSuccess, setIdAvailableSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getRoleHeader = () => {
    switch (role) {
      case 'STUDENT':
        return {
          title: 'Student Inmate Registration',
          idLabel: 'Register Number / Roll No',
          idPlaceholder: 'e.g., 2024508003 or 2022506042',
          icon: GraduationCap,
          desc: 'Register your hostel room and parental emergency contact info'
        };
      case 'RC':
        return {
          title: 'Resident Counsellor (RC) Registration',
          idLabel: 'Staff ID',
          idPlaceholder: 'e.g., RC-SCI-104 or RC-KAVERI-01',
          icon: ShieldCheck,
          desc: 'Register staff counsellor account for digital leave approvals'
        };
      case 'EW':
        return {
          title: 'Executive Warden (EW) Registration',
          idLabel: 'Warden Office ID',
          idPlaceholder: 'e.g., EW-OFFICE-02',
          icon: Building2,
          desc: 'Register administrative official account with central oversight'
        };
      case 'GATEKEEPER':
        return {
          title: 'Security Gatekeeper Registration',
          idLabel: 'Security Badge / Guard ID',
          idPlaceholder: 'e.g., SEC-GATE-02',
          icon: KeyRound,
          desc: 'Register main gate terminal account for QR pass logging'
        };
    }
  };

  const header = getRoleHeader();
  const Icon = header.icon;

  // Real-time duplicate check when user finishes typing the ID
  const handleCheckDuplicate = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || trimmed.length < 3) {
      setIdDuplicateError(null);
      setIdAvailableSuccess(false);
      return;
    }

    setIsCheckingId(true);
    setIdDuplicateError(null);
    setIdAvailableSuccess(false);

    try {
      const res = await checkIfUniqueIdExists(trimmed);
      if (res.exists) {
        setIdDuplicateError(`Duplicate ID Alert: ID "${trimmed}" is already registered as a ${res.existingRole || 'user'} in the database. Duplication is strictly prevented.`);
        setIdAvailableSuccess(false);
      } else {
        setIdAvailableSuccess(true);
        setIdDuplicateError(null);
      }
    } catch {
      // Ignore network hiccup on check
    } finally {
      setIsCheckingId(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!uniqueId.trim()) {
      setErrorMessage(`Please enter a valid ${header.idLabel}.`);
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Final atomic duplicate check before database write
      const duplicateCheck = await checkIfUniqueIdExists(uniqueId);
      if (duplicateCheck.exists) {
        setErrorMessage(`Duplicate ID Error: "${uniqueId}" already exists in the Firebase database as a ${duplicateCheck.existingRole}. Please choose a unique ID or login.`);
        setIsSubmitting(false);
        return;
      }

      // Build profile payload
      const profilePayload: Omit<UserProfile, 'id' | 'createdAt'> = {
        uniqueId: uniqueId.trim(),
        role,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        ...(role === 'STUDENT' ? {
          hostelBlock,
          roomNumber: roomNumber.trim(),
          branch,
          year,
          parentPhone: parentPhone.trim(),
          guardianName: guardianName.trim()
        } : {}),
        ...(role === 'RC' ? {
          hostelBlock,
          designation: designation.trim() || `Resident Counsellor (${hostelBlock} Block)`
        } : {}),
        ...(role === 'EW' ? {
          designation: designation.trim() || 'Hostel Executive Office'
        } : {}),
        ...(role === 'GATEKEEPER' ? {
          gateLocation
        } : {})
      };

      const result = await registerUser(profilePayload);

      if (result.success && result.user) {
        onRegisterSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Registration failed. Please check information.');
      }
    } catch (err) {
      setErrorMessage('Failed to connect to Firebase database. Please check connection.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl">
        {/* Back navigation */}
        <button
          onClick={onBackToRoles}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Role Selection</span>
        </button>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-zinc-800 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-md shrink-0">
                <Icon className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {header.title}
                </h2>
                <p className="text-xs text-zinc-400">
                  {header.desc}
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-emerald-400 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Duplicate ID Prevention
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Registration Notice</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Primary Unique ID with Duplicate Detection */}
            <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/90 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-zinc-200">
                  {header.idLabel} <span className="text-red-400">* (Must be Unique)</span>
                </label>
                {isCheckingId && (
                  <span className="text-[10px] text-zinc-400 animate-pulse">Checking database...</span>
                )}
                {idAvailableSuccess && (
                  <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> ID is available
                  </span>
                )}
              </div>
              <input
                type="text"
                value={uniqueId}
                onChange={(e) => {
                  setUniqueId(e.target.value);
                  handleCheckDuplicate(e.target.value);
                }}
                onBlur={() => handleCheckDuplicate(uniqueId)}
                placeholder={header.idPlaceholder}
                className={`w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border ${
                  idDuplicateError ? 'border-red-500 focus:border-red-500' : idAvailableSuccess ? 'border-emerald-600 focus:border-emerald-500' : 'border-zinc-700 focus:border-zinc-500'
                } text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono`}
                required
              />
              {idDuplicateError && (
                <div className="p-2 rounded bg-red-950/80 border border-red-800/80 text-red-300 text-xs flex items-start gap-2 mt-1">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{idDuplicateError}</span>
                </div>
              )}
              <p className="text-[11px] text-zinc-400">
                This ID will be permanently recorded in Firebase. No duplicate accounts can be created with this identifier.
              </p>
            </div>

            {/* General Info: Name, Email, Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., K. Vigneshwaran"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Contact Phone Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +91 98401 23456"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Institutional / Official Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g., student.roll@annauniv.edu or staff@mitindia.edu"
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>

            {/* Role-Specific Fields */}
            {role === 'STUDENT' && (
              <div className="space-y-4 pt-2 border-t border-zinc-800/80">
                <p className="text-xs font-semibold text-zinc-300">Hostel Residency & Academic Info</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Hostel Block</label>
                    <select
                      value={hostelBlock}
                      onChange={(e) => setHostelBlock(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      {HOSTEL_BLOCKS.map(b => (
                        <option key={b} value={b}>{b} Block</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Room Number <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      placeholder="e.g., 204 or 312"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Department / Branch</label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      {BRANCHES.map(br => (
                        <option key={br} value={br}>{br}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Year of Study</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="I">I Year</option>
                      <option value="II">II Year</option>
                      <option value="III">III Year</option>
                      <option value="IV">IV Year</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Parent Contact Phone <span className="text-red-400">*</span></label>
                    <input
                      type="tel"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="e.g., +91 94441 98765"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                      required
                    />
                    <p className="text-[10px] text-zinc-400 mt-0.5">RC will call this number for verification</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Parent / Guardian Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="e.g., K. Karunakaran (Father)"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {role === 'RC' && (
              <div className="space-y-4 pt-2 border-t border-zinc-800">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-zinc-200">
                      Select Assigned Hostel Block <span className="text-red-400">* (Specialized Inmate Database)</span>
                    </label>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                      Block-Specialized
                    </span>
                  </div>
                  <select
                    value={hostelBlock}
                    onChange={(e) => setHostelBlock(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-950 border border-zinc-700 text-sm font-semibold text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                    required
                  >
                    {HOSTEL_BLOCKS.map(block => (
                      <option key={block} value={block} className="bg-zinc-900 text-white py-1">
                        {block} Block (Hostel)
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                    Student outpass applications from this specific hostel block will be stored in a specialized database partition and automatically routed to your RC console for confirmation.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Faculty Department / Designation (Optional)
                  </label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder={`Resident Counsellor, ${hostelBlock} Block`}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            )}

            {role === 'GATEKEEPER' && (
              <div className="space-y-3 pt-2 border-t border-zinc-800">
                <label className="block text-xs font-medium text-zinc-300">Assigned Gate Post Location</label>
                <select
                  value={gateLocation}
                  onChange={(e) => setGateLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                >
                  {GATE_LOCATIONS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Password Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Create Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting || !!idDuplicateError}
                className="w-full py-3 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Complete Registration & Save to Firebase</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Link back to login */}
          <div className="mt-6 pt-5 border-t border-zinc-800 text-center">
            <p className="text-xs text-zinc-400">
              Already have an account registered?
            </p>
            <button
              type="button"
              onClick={onGoToLogin}
              className="mt-1.5 text-xs font-semibold text-zinc-200 hover:text-white underline transition-colors"
            >
              Sign In to {role} Portal →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
