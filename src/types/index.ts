export type Role = 'STUDENT' | 'RC' | 'EW' | 'GATEKEEPER';

export type OutpassStatus = 
  | 'PENDING_RC'
  | 'APPROVED'
  | 'REJECTED'
  | 'OUT_OF_CAMPUS'
  | 'RETURNED_TO_CAMPUS'
  | 'CANCELLED'
  | 'EXPIRED';

export interface UserProfile {
  id: string;
  uniqueId: string; // Reg No (Student), Staff ID (RC), Warden ID (EW), Badge ID (Gatekeeper)
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
