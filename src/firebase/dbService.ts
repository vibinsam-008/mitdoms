import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config';
import { UserProfile, OutpassRequest, AuditLogEntry, Role } from '../types';

// Normalized key helper to prevent duplicate IDs
export function normalizeId(id: string): string {
  return id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function getAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  // Academic year typically starts around June/July
  if (month >= 5) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

// Local cache key for cross-device & offline fallback
const LOCAL_USERS_KEY = 'mit_outpass_users_cache';
const LOCAL_REQUESTS_KEY = 'mit_outpass_requests_cache';
const LOCAL_AUDIT_KEY = 'mit_outpass_audit_cache';

function getLocalUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUser(user: UserProfile) {
  try {
    const users = getLocalUsers().filter(u => u.uniqueId.toUpperCase() !== user.uniqueId.toUpperCase());
    users.push(user);
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Local cache save failed', e);
  }
}

function getLocalRequests(): OutpassRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalRequest(req: OutpassRequest) {
  try {
    const reqs = getLocalRequests().filter(r => r.outpassId !== req.outpassId);
    reqs.unshift(req);
    localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(reqs));
  } catch (e) {
    console.error('Local requests cache failed', e);
  }
}

/**
 * Checks if a Unique ID (Register No, Staff ID, Warden ID, or Badge ID) already exists
 * Enforces strictly that no two accounts can share the same ID.
 */
export async function checkIfUniqueIdExists(uniqueId: string): Promise<{ exists: boolean; existingRole?: Role; existingUser?: UserProfile }> {
  const cleanId = normalizeId(uniqueId);
  if (!cleanId) return { exists: false };

  // 1. Check direct doc in Firestore
  try {
    const userDocRef = doc(db, 'users', `USR_${cleanId}`);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      return { exists: true, existingRole: data.role, existingUser: data };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/USR_${cleanId}`);
  }

  // 2. Query Firestore by uniqueId field just in case
  try {
    const q = query(collection(db, 'users'), where('uniqueId', '==', uniqueId.trim()));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      const data = qSnap.docs[0].data() as UserProfile;
      return { exists: true, existingRole: data.role, existingUser: data };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }

  // 3. Check local cache
  const local = getLocalUsers().find(u => normalizeId(u.uniqueId) === cleanId);
  if (local) {
    return { exists: true, existingRole: local.role, existingUser: local };
  }

  return { exists: false };
}

/**
 * Registers a new user with strict duplicate ID check.
 * Saves directly into Firebase Firestore!
 */
export async function registerUser(profile: Omit<UserProfile, 'id' | 'createdAt'>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const cleanId = normalizeId(profile.uniqueId);
  if (!cleanId) {
    return { success: false, error: 'A valid Unique ID (Register Number / Staff ID) is required.' };
  }

  // Duplicate Check
  const check = await checkIfUniqueIdExists(cleanId);
  if (check.exists) {
    return {
      success: false,
      error: `Duplicate ID Error: An account with ID "${profile.uniqueId}" already exists as a ${check.existingRole || 'user'}. Duplication is strictly prevented.`
    };
  }

  const newProfile: UserProfile = {
    ...profile,
    id: `USR_${cleanId}`,
    uniqueId: profile.uniqueId.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'users', newProfile.id), newProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${newProfile.id}`);
  }

  // Always update local cache
  saveLocalUser(newProfile);

  // Record Audit Trail
  await recordAuditLog({
    eventId: `LOG_REG_${cleanId}_${Date.now()}`,
    outpassId: 'SYSTEM_USER',
    action: `USER_REGISTRATION_${newProfile.role}`,
    actorRole: newProfile.role,
    actorName: newProfile.name,
    actorId: newProfile.uniqueId,
    timestamp: new Date().toISOString(),
    remarks: `User registered with ID ${newProfile.uniqueId} for ${newProfile.role}`,
    academicYear: getAcademicYear()
  });

  return { success: true, user: newProfile };
}

/**
 * Authenticates user by role and Unique ID / Email
 */
export async function loginUser(role: Role, identifier: string, password?: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const clean = identifier.trim().toLowerCase();
  const cleanId = normalizeId(identifier);

  let foundUser: UserProfile | null = null;

  // 1. Try direct fetch from Firestore
  try {
    const userDocRef = doc(db, 'users', `USR_${cleanId}`);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      foundUser = snap.data() as UserProfile;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/USR_${cleanId}`);
  }

  // 2. If not found, try query by email or uniqueId
  if (!foundUser) {
    try {
      const q = query(collection(db, 'users'), where('role', '==', role));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const u = d.data() as UserProfile;
        if (
          normalizeId(u.uniqueId) === cleanId ||
          u.email.toLowerCase() === clean
        ) {
          foundUser = u;
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  }

  // 3. Fallback to local cache if offline
  if (!foundUser) {
    const local = getLocalUsers().find(
      u => (normalizeId(u.uniqueId) === cleanId || u.email.toLowerCase() === clean) && u.role === role
    );
    if (local) {
      foundUser = local;
    }
  }

  if (!foundUser) {
    return {
      success: false,
      error: `No ${role} account found with ID or Email "${identifier}". Please check or register a new account.`
    };
  }

  if (foundUser.role !== role) {
    return {
      success: false,
      error: `This account is registered as ${foundUser.role}, not ${role}. Please switch to the ${foundUser.role} portal.`
    };
  }

  // If password provided and user has password, verify
  if (foundUser.password && password && foundUser.password !== password) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  return { success: true, user: foundUser };
}

/**
 * Creates an Outpass Application in Firestore
 */
export async function createOutpass(data: Omit<OutpassRequest, 'outpassId' | 'status' | 'verificationToken' | 'academicYear' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; outpass?: OutpassRequest; error?: string }> {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const outpassId = `OP-${new Date().getFullYear()}-${randomSuffix}`;
  const verificationToken = `TOKEN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

  const request: OutpassRequest = {
    ...data,
    outpassId,
    status: 'PENDING_RC',
    verificationToken,
    academicYear: getAcademicYear(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'requests', outpassId), request);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${outpassId}`);
  }

  saveLocalRequest(request);

  await recordAuditLog({
    eventId: `LOG_REQ_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'OUTPASS_CREATED',
    actorRole: 'STUDENT',
    actorName: request.studentName,
    actorId: request.studentRegNo,
    timestamp: new Date().toISOString(),
    remarks: `Application submitted for destination: ${request.destination} (${request.proposedDays} days)`,
    academicYear: request.academicYear
  });

  return { success: true, outpass: request };
}

/**
 * Real-time subscription to Outpasses using Firestore onSnapshot
 * Supports seamless multi-device updates (Student applies on phone -> RC manages on phone -> Gatekeeper & EW receive)
 */
export function subscribeToOutpasses(
  callback: (requests: OutpassRequest[]) => void
): () => void {
  try {
    const q = collection(db, 'requests');
    const unsubscribe = onSnapshot(
      q,
      snapshot => {
        const list: OutpassRequest[] = [];
        snapshot.forEach(docSnap => {
          list.push(docSnap.data() as OutpassRequest);
        });
        // Sort newest first
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        // Sync to local cache
        list.forEach(item => saveLocalRequest(item));
        callback(list);
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'requests');
        // On error, deliver from local cache
        const local = getLocalRequests();
        callback(local);
      }
    );
    return unsubscribe;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'requests');
    callback(getLocalRequests());
    return () => {};
  }
}

/**
 * RC Action: Approve or Reject Student Outpass
 */
export async function rcReviewOutpass(
  outpassId: string,
  decision: 'APPROVED' | 'REJECTED',
  remarks: string,
  parentCallVerified: boolean,
  rcUser: UserProfile
): Promise<boolean> {
  const decidedAt = new Date().toISOString();
  const newStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  const updatePayload = {
    status: newStatus,
    rcDecision: {
      decision,
      rcId: rcUser.uniqueId,
      rcName: rcUser.name,
      remarks: remarks || (decision === 'APPROVED' ? 'Approved by Resident Counsellor' : 'Declined by Resident Counsellor'),
      parentCallVerified,
      decidedAt
    },
    updatedAt: decidedAt
  };

  try {
    await updateDoc(doc(db, 'requests', outpassId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  // Update local cache
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      return { ...r, ...updatePayload };
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  // Immutable audit log
  await recordAuditLog({
    eventId: `LOG_RC_${outpassId}_${Date.now()}`,
    outpassId,
    action: `RC_${decision}`,
    actorRole: 'RC',
    actorName: rcUser.name,
    actorId: rcUser.uniqueId,
    timestamp: decidedAt,
    remarks: `${decision} by RC. Parent Call Verified: ${parentCallVerified ? 'YES' : 'NO'}. Remarks: ${remarks}`,
    academicYear: getAcademicYear()
  });

  return true;
}

/**
 * Gatekeeper Action: Log Campus Departure (Check-Out)
 */
export async function gateLogDeparture(
  outpassId: string,
  gatekeeperUser: UserProfile,
  securityNote?: string
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const updatePayload = {
    status: 'OUT_OF_CAMPUS' as const,
    'gateLogs.departedAt': timestamp,
    'gateLogs.departedGatekeeperId': gatekeeperUser.uniqueId,
    'gateLogs.departedGatekeeperName': gatekeeperUser.name,
    'gateLogs.departedGatePost': gatekeeperUser.gateLocation || 'Main Gate',
    'gateLogs.securityNote': securityNote || 'Passed security check at gate',
    updatedAt: timestamp
  };

  try {
    await updateDoc(doc(db, 'requests', outpassId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  // Update local cache
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      return {
        ...r,
        status: 'OUT_OF_CAMPUS' as const,
        gateLogs: {
          ...r.gateLogs,
          departedAt: timestamp,
          departedGatekeeperId: gatekeeperUser.uniqueId,
          departedGatekeeperName: gatekeeperUser.name,
          departedGatePost: gatekeeperUser.gateLocation || 'Main Gate',
          securityNote: securityNote || 'Passed security check at gate'
        },
        updatedAt: timestamp
      };
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  await recordAuditLog({
    eventId: `LOG_GATE_OUT_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'GATE_CAMPUS_EXIT',
    actorRole: 'GATEKEEPER',
    actorName: gatekeeperUser.name,
    actorId: gatekeeperUser.uniqueId,
    timestamp,
    remarks: `Student exited campus through ${gatekeeperUser.gateLocation || 'Main Gate'}. Note: ${securityNote || 'None'}`,
    academicYear: getAcademicYear()
  });

  return true;
}

/**
 * Gatekeeper Action: Log Campus Return (Check-In)
 */
export async function gateLogReturn(
  outpassId: string,
  gatekeeperUser: UserProfile,
  expectedReturnTime: string,
  securityNote?: string
): Promise<{ success: boolean; isLate: boolean }> {
  const timestamp = new Date().toISOString();
  const actualReturn = new Date(timestamp).getTime();
  const expectedReturn = new Date(expectedReturnTime).getTime();
  const isLate = actualReturn > expectedReturn;

  const updatePayload = {
    status: 'RETURNED_TO_CAMPUS' as const,
    'gateLogs.returnedAt': timestamp,
    'gateLogs.returnedGatekeeperId': gatekeeperUser.uniqueId,
    'gateLogs.returnedGatekeeperName': gatekeeperUser.name,
    'gateLogs.returnedGatePost': gatekeeperUser.gateLocation || 'Main Gate',
    'gateLogs.isLate': isLate,
    'gateLogs.securityNote': securityNote || (isLate ? 'Returned past expected curfew' : 'Returned on time'),
    updatedAt: timestamp
  };

  try {
    await updateDoc(doc(db, 'requests', outpassId), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  // Update local cache
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      return {
        ...r,
        status: 'RETURNED_TO_CAMPUS' as const,
        gateLogs: {
          ...r.gateLogs,
          returnedAt: timestamp,
          returnedGatekeeperId: gatekeeperUser.uniqueId,
          returnedGatekeeperName: gatekeeperUser.name,
          returnedGatePost: gatekeeperUser.gateLocation || 'Main Gate',
          isLate,
          securityNote: securityNote || (isLate ? 'Returned past expected curfew' : 'Returned on time')
        },
        updatedAt: timestamp
      };
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  await recordAuditLog({
    eventId: `LOG_GATE_IN_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'GATE_CAMPUS_ENTRY',
    actorRole: 'GATEKEEPER',
    actorName: gatekeeperUser.name,
    actorId: gatekeeperUser.uniqueId,
    timestamp,
    remarks: `Student returned to campus. Is Late: ${isLate ? 'YES (OVERDUE)' : 'NO (ON TIME)'}. Note: ${securityNote || 'Normal entry'}`,
    academicYear: getAcademicYear()
  });

  return { success: true, isLate };
}

/**
 * Record immutable audit log for 20-year preservation
 */
export async function recordAuditLog(entry: AuditLogEntry) {
  try {
    await setDoc(doc(db, 'audit_logs', entry.eventId), entry);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `audit_logs/${entry.eventId}`);
  }

  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const list: AuditLogEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(list.slice(0, 500)));
  } catch {
    // Ignore cache error
  }
}

/**
 * Fetch Audit Logs for EW / Hostel Office
 */
export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const q = query(collection(db, 'audit_logs'), limit(150));
    const snap = await getDocs(q);
    const list: AuditLogEntry[] = [];
    snap.forEach(d => list.push(d.data() as AuditLogEntry));
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'audit_logs');
    try {
      const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Pre-seeds initial realistic accounts for all 4 roles so testing works instantly
 */
export async function seedInitialDemoData(): Promise<void> {
  const seedUsers: UserProfile[] = [
    {
      id: 'USR_2022506042',
      uniqueId: '2022506042',
      role: 'STUDENT',
      name: 'K. Vigneshwaran',
      email: 'vignesh.2022506042@annauniv.edu',
      phone: '+91 98401 23456',
      hostelBlock: 'Marutham',
      roomNumber: '204',
      branch: 'Artificial Intelligence & Data Science (AI&DS)',
      year: 'III',
      parentPhone: '+91 94441 98765',
      guardianName: 'K. Karunakaran (Father)',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_2023504018',
      uniqueId: '2023504018',
      role: 'STUDENT',
      name: 'Ananya R.',
      email: 'ananya.2023504018@annauniv.edu',
      phone: '+91 97910 54321',
      hostelBlock: 'Thamirabarani',
      roomNumber: '312',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'II',
      parentPhone: '+91 98840 87654',
      guardianName: 'R. Raghuram (Father)',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_RC-MANICKAM',
      uniqueId: 'RC-MANICKAM',
      role: 'RC',
      name: 'Dr. R. Manickam',
      email: 'rc.manickam@mitindia.edu',
      phone: '+91 98410 77889',
      designation: 'Resident Counsellor (Marutham & Thamirabarani Blocks)',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_EW-WARDEN-01',
      uniqueId: 'EW-WARDEN-01',
      role: 'EW',
      name: 'Prof. Dr. S. K. Sundaramoorthy',
      email: 'ew.warden@mitindia.edu',
      phone: '+91 94440 11223',
      designation: 'Executive Warden, MIT Hostels',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_SEC-GATE-01',
      uniqueId: 'SEC-GATE-01',
      role: 'GATEKEEPER',
      name: 'M. Selvam',
      email: 'security.main@mitindia.edu',
      phone: '+91 91234 56789',
      gateLocation: 'Main Gate (GST Road)',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    }
  ];

  for (const u of seedUsers) {
    saveLocalUser(u);
    try {
      await setDoc(doc(db, 'users', u.id), u, { merge: true });
    } catch {
      // Offline fallback
    }
  }

  // Pre-seed sample active outpass requests
  const sampleRequests: OutpassRequest[] = [
    {
      outpassId: 'OP-2026-1042',
      studentId: 'USR_2022506042',
      studentName: 'K. Vigneshwaran',
      studentRegNo: '2022506042',
      hostelBlock: 'Marutham',
      roomNumber: '204',
      branch: 'Artificial Intelligence & Data Science (AI&DS)',
      year: 'III',
      studentPhone: '+91 98401 23456',
      parentPhone: '+91 94441 98765',
      destination: 'Tiruchirappalli (Hometown)',
      visitAddress: '14/B, Salai Road, Thillai Nagar, Tiruchirappalli - 620018',
      purpose: 'Weekend hometown visit and family religious function',
      proposedDays: 2,
      departureDateTime: new Date(Date.now() + 3600000 * 2).toISOString(),
      returnDateTime: new Date(Date.now() + 3600000 * 50).toISOString(),
      status: 'PENDING_RC',
      verificationToken: 'TOKEN-VIGNESH-99',
      academicYear: getAcademicYear(),
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      outpassId: 'OP-2026-1039',
      studentId: 'USR_2023504018',
      studentName: 'Ananya R.',
      studentRegNo: '2023504018',
      hostelBlock: 'Thamirabarani',
      roomNumber: '312',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'II',
      studentPhone: '+91 97910 54321',
      parentPhone: '+91 98840 87654',
      destination: 'Coimbatore (Medical Consultation)',
      visitAddress: '78, Gandhipuram 4th Cross, Coimbatore - 641012',
      purpose: 'Dental surgery follow-up appointment with doctor',
      proposedDays: 3,
      departureDateTime: new Date(Date.now() - 3600000 * 4).toISOString(),
      returnDateTime: new Date(Date.now() + 3600000 * 48).toISOString(),
      status: 'APPROVED',
      rcDecision: {
        decision: 'APPROVED',
        rcId: 'RC-MANICKAM',
        rcName: 'Dr. R. Manickam',
        remarks: 'Spoke with father R. Raghuram. Leave sanctioned.',
        parentCallVerified: true,
        decidedAt: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      verificationToken: 'TOKEN-ANANYA-77',
      academicYear: getAcademicYear(),
      createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 2).toISOString()
    }
  ];

  for (const r of sampleRequests) {
    saveLocalRequest(r);
    try {
      await setDoc(doc(db, 'requests', r.outpassId), r, { merge: true });
    } catch {
      // Offline fallback
    }
  }
}
