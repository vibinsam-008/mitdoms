export type Role = 'STUDENT' | 'RC' | 'EW' | 'GATEKEEPER' | 'MESS_STAFF';

export type OutpassStatus = 
  | 'PENDING_RC'
  | 'APPROVED'
  | 'REJECTED'
  | 'OUT_OF_CAMPUS'
  | 'RETURNED_TO_CAMPUS'
  | 'CANCELLED'
  | 'EXPIRED';

export type OutpassCategory = 'NATIVE' | 'GENERAL' | 'MEDICAL' | 'OFFICIAL_OD' | 'EMERGENCY';

export interface UserProfile {
  id: string;
  uniqueId: string; // Reg No (Student), Staff ID (RC), Warden ID (EW), Badge ID (Gatekeeper), Staff ID (Mess)
  role: Role;
  name: string;
  email: string;
  phone: string;
  hostelBlock?: string;
  roomNumber?: string;
  branch?: string;
  year?: string;
  parentPhone?: string;
  guardianName?: string;
  gateLocation?: string;
  designation?: string;
  password?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RCDecision {
  decision: 'APPROVED' | 'REJECTED';
  rcId: string;
  rcName: string;
  remarks: string;
  parentCallVerified: boolean;
  decidedAt: string;
}

export interface EWDecision {
  decision: 'APPROVED' | 'REJECTED';
  ewId: string;
  ewName: string;
  remarks: string;
  decidedAt: string;
}

export interface GateLogs {
  departedAt?: string;
  departedGatekeeperId?: string;
  departedGatekeeperName?: string;
  departedGatePost?: string;
  returnedAt?: string;
  returnedGatekeeperId?: string;
  returnedGatekeeperName?: string;
  returnedGatePost?: string;
  isLate?: boolean;
  securityNote?: string;
}

export interface MedicalDetails {
  diseaseType: string; // e.g., 'Viral Fever', 'Dengue Fever', 'Typhoid', 'Food Poisoning / Gastroenteritis', 'Orthopedic / Fracture'
  doctorName?: string;
  hospitalClinic?: string;
  symptoms?: string;
  bedRestDays?: number;
  prescriptionUploaded?: boolean;
}

export interface OutpassRequest {
  outpassId: string; // e.g., OP-2026-1042
  studentId: string;
  studentName: string;
  studentRegNo: string;
  hostelBlock: string;
  roomNumber: string;
  branch: string;
  year: string;
  studentPhone: string;
  parentPhone: string;
  destination: string;
  visitAddress: string;
  purpose: string;
  category?: OutpassCategory;
  isMedicalLeave?: boolean;
  isNativePlace?: boolean;
  diseaseType?: string; // Type of disease e.g., Viral Fever, Dengue
  medicalDetails?: MedicalDetails;
  proposedDays: number;
  departureDateTime: string;
  returnDateTime: string;
  status: OutpassStatus;
  rcDecision?: RCDecision;
  ewDecision?: EWDecision;
  gateLogs?: GateLogs;
  verificationToken: string;
  academicYear: string; // e.g. "2026-2027"
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  eventId: string;
  outpassId: string;
  action: string;
  actorRole: Role | 'SYSTEM';
  actorName: string;
  actorId: string;
  timestamp: string;
  remarks?: string;
  academicYear: string;
}

// =========================================================================
// EXECUTIVE WARDEN OPERATIONAL & SANITATION TYPES
// =========================================================================

// Operational drill-down record for sanitation workflow:
// CRITICAL PRIVACY: Suppresses all clinical notes, symptoms, and diagnoses.
export interface OperationalSanitationRecord {
  outpassId: string;
  studentName: string;
  studentRegNo: string;
  hostelBlock: string;
  roomNumber: string;
  departureDateTime: string;
  returnDateTime: string;
  status: OutpassStatus;
  gateStatus: 'APPROVED_NOT_DEPARTED' | 'CURRENTLY_AWAY' | 'RETURNED' | 'PENDING';
  departedAt?: string;
  returnedAt?: string;
  emergencyContact: string;
  updatedAt: string;
}

export interface EWNativePlaceStats {
  approvedUnused: number; // Approved, not exited yet
  currentlyAway: number;  // Verified gate exit, not returned
  returned: number;       // Returned to campus
  totalApproved: number;  // Total approved native passes
}

export interface EWMedicalLeaveStats {
  approvedUnused: number; // Approved, not exited yet
  currentlyAway: number;  // Exited campus, currently away
  returned: number;       // Returned to campus
  totalApproved: number;  // Total approved medical passes
}

export interface EWHostelStatusStats {
  totalRegistered: number;
  currentlyPresent: number;
  currentlyAway: number;
  approvedUnused: number;
  unverifiedCount: number;
  presencePercentage: number;
  isEstimated: boolean;
}

export interface EWDashboardSummary {
  nativePlace: EWNativePlaceStats;
  medicalLeave: EWMedicalLeaveStats;
  hostelStatus: EWHostelStatusStats;
  blockBreakdown: Record<string, {
    registered: number;
    present: number;
    away: number;
    approvedUnused: number;
    nativeAway: number;
    medicalAway: number;
  }>;
  lastUpdated: string;
}

// =========================================================================
// HOLIDAY HOSTEL OCCUPANCY & MESS COUNT TYPES
// =========================================================================

export interface HolidayPeriod {
  id: string; // e.g. 'deepavali-2026'
  name: string; // 'Deepavali Vacation 2026'
  startDate: string; // '2026-11-06'
  endDate: string; // '2026-11-12'
  submissionDeadline: string; // '2026-11-04T18:00:00.000Z'
  academicYear: string; // '2026-2027'
  description?: string;
  isActive: boolean;
}

export interface DailyMealRequirement {
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

export interface HolidayDeclaration {
  id: string; // Deterministic: `DEC_${periodId}_${studentRegNo}`
  studentId: string;
  studentRegNo: string;
  studentName: string;
  hostelBlock: string;
  roomNumber: string;
  periodId: string;
  stayingInHostel: boolean;
  presenceDates: string[]; // List of ISO date strings YYYY-MM-DD
  mealsByDate: Record<string, DailyMealRequirement>;
  operationalNotes?: string;
  submittedAt: string;
  updatedAt: string;
  academicYear: string;
}

export interface MessDailyReport {
  date: string;
  expectedOccupancy: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  blockBreakdown: Record<string, {
    occupancy: number;
    breakfast: number;
    lunch: number;
    dinner: number;
  }>;
}

export interface MessPlanningReport {
  period: HolidayPeriod;
  lastUpdated: string;
  totalRegisteredStudents: number;
  totalSubmissions: number;
  submissionRate: number; // percentage (0 - 100)
  nonRespondentsCount: number;
  nonRespondents: Array<{
    studentRegNo: string;
    studentName: string;
    hostelBlock: string;
    roomNumber: string;
  }>;
  dailyReports: MessDailyReport[];
  disclaimer: string;
}

// Helper: Determine if an outpass is for travel to Native Place
export function isNativePlaceRequest(req: OutpassRequest): boolean {
  if (req.category === 'NATIVE') return true;
  if (req.isNativePlace) return true;
  const text = `${req.purpose || ''} ${req.destination || ''} ${req.visitAddress || ''}`.toLowerCase();
  return (
    text.includes('native') ||
    text.includes('home') ||
    text.includes('parents') ||
    text.includes('family') ||
    text.includes('hometown') ||
    text.includes('village')
  );
}

// Helper: Determine if an outpass is an approved medical leave
export function isApprovedMedicalRequest(req: OutpassRequest): boolean {
  const isMed = req.isMedicalLeave === true || 
    req.category === 'MEDICAL' || 
    Boolean(req.diseaseType && req.diseaseType.trim().length > 0) ||
    /medical|fever|hospital|doctor|clinic|dengue|infection|illness|rest/i.test(`${req.purpose || ''} ${req.destination || ''}`);
  return isMed && ['APPROVED', 'OUT_OF_CAMPUS', 'RETURNED_TO_CAMPUS'].includes(req.status);
}

export const HOSTEL_BLOCKS = [
  'Marutham',
  'Thamirabarani',
  'Kaveri',
  'Vaigai',
  'Amaravathi',
  'Bhavani',
  'Ponni',
  'Ganga',
  'Kurinji',
  'Orchid',
  'NRI Hostel'
] as const;

export const BRANCHES = [
  'Artificial Intelligence & Data Science (AI&DS)',
  'Computer Science & Engineering (CSE)',
  'Electronics & Communication Engineering (ECE)',
  'Information Technology (IT)',
  'Aeronautical Engineering',
  'Automobile Engineering',
  'Mechanical Engineering',
  'Production Technology',
  'Rubber & Plastics Technology'
] as const;

export const GATE_LOCATIONS = [
  'Main Gate (GST Road)',
  'East Gate (MIT Bridge)',
  'Hostel Campus Back Gate'
] as const;

export const COMMON_DISEASES = [
  'Viral Fever / High Temperature',
  'Dengue Fever',
  'Typhoid',
  'Acute Gastroenteritis / Food Poisoning',
  'Chickenpox / Varicella',
  'Orthopedic / Fracture / Ligament Tear',
  'Severe Migraine / Neurological',
  'Asthma / Acute Respiratory Infection',
  'Eye Infection / Viral Conjunctivitis',
  'Jaundice / Viral Hepatitis',
  'Post-Surgical Recovery',
  'Dental Emergency / Surgery',
  'Other Medical Illness'
] as const;
