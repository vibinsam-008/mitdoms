import {
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureFirestoreActive } from './config';
import { 
  UserProfile, 
  OutpassRequest, 
  OutpassStatus, 
  AuditLogEntry, 
  Role,
  HolidayPeriod,
  HolidayDeclaration,
  DailyMealRequirement,
  MessPlanningReport,
  MessDailyReport,
  EWDashboardSummary,
  OperationalSanitationRecord,
  isNativePlaceRequest,
  isApprovedMedicalRequest,
  HOSTEL_BLOCKS
} from '../types';

// Normalized key helper to prevent duplicate IDs and ensure valid Firestore document paths
export function normalizeId(id: string): string {
  if (!id) return '';
  return id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function getAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  if (month >= 5) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

// Local cache keys
const LOCAL_USERS_KEY = 'mit_outpass_users_cache';
const LOCAL_REQUESTS_KEY = 'mit_outpass_requests_cache';
const LOCAL_AUDIT_KEY = 'mit_outpass_audit_cache';
const LOCAL_HOLIDAY_PERIODS_KEY = 'mit_holiday_periods_cache';
const LOCAL_HOLIDAY_DECLARATIONS_KEY = 'mit_holiday_declarations_cache';
const SEED_FLAG_KEY = 'mit_outpass_seeded_v6';

// BroadcastChannel for sub-millisecond local/cross-tab synchronization
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    syncChannel = new BroadcastChannel('mit_outpass_instant_sync');
  } catch {
    syncChannel = null;
  }
}

function notifyLocalSync(data: OutpassRequest) {
  try {
    syncChannel?.postMessage({ type: 'OUTPASS_UPDATED', payload: data });
  } catch {
    // Ignore channel error
  }
  try {
    localStorage.setItem('mit_last_sync_timestamp', Date.now().toString());
  } catch {
    // Ignore storage error
  }
}

function getLocalUsers(): UserProfile[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUser(user: UserProfile) {
  if (typeof localStorage === 'undefined') return;
  try {
    const users = getLocalUsers().filter(u => u.uniqueId.toUpperCase() !== user.uniqueId.toUpperCase());
    users.push(user);
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Local cache save failed', e);
  }
}

function getLocalRequests(): OutpassRequest[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalRequest(req: OutpassRequest) {
  if (typeof localStorage === 'undefined') return;
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
 */
export async function checkIfUniqueIdExists(uniqueId: string): Promise<{ exists: boolean; existingRole?: Role; existingUser?: UserProfile }> {
  const cleanId = normalizeId(uniqueId);
  if (!cleanId) return { exists: false };

  // 1. Check shared user registry document in Firestore
  try {
    const regSnap = await getDoc(doc(db, 'system_config', 'user_registry'));
    if (regSnap.exists()) {
      const data = regSnap.data() as Record<string, UserProfile>;
      if (data && data[cleanId]) {
        return { exists: true, existingRole: data[cleanId].role, existingUser: data[cleanId] };
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'system_config/user_registry');
  }

  // 2. Check direct student or admin collection document
  try {
    const studentSnap = await getDoc(doc(db, 'students', cleanId));
    if (studentSnap.exists()) {
      const data = studentSnap.data() as UserProfile;
      return { exists: true, existingRole: data.role || 'STUDENT', existingUser: data };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `students/${cleanId}`);
  }

  try {
    const adminSnap = await getDoc(doc(db, 'admins', cleanId));
    if (adminSnap.exists()) {
      const data = adminSnap.data() as UserProfile;
      return { exists: true, existingRole: data.role, existingUser: data };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `admins/${cleanId}`);
  }

  // 3. Check local cache
  const local = getLocalUsers().find(u => normalizeId(u.uniqueId) === cleanId);
  if (local) {
    return { exists: true, existingRole: local.role, existingUser: local };
  }

  return { exists: false };
}

/**
 * Registers a new user with strict duplicate ID check across Firestore & local cache.
 */
export async function registerUser(profile: Omit<UserProfile, 'id' | 'createdAt'>): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const cleanId = normalizeId(profile.uniqueId);
  if (!cleanId) {
    return { success: false, error: 'A valid Unique ID (Register Number / Staff ID) is required.' };
  }

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

  // 1. Save to role-specific authorized collection in Firestore
  try {
    if (profile.role === 'STUDENT') {
      await setDoc(doc(db, 'students', cleanId), newProfile);
    } else {
      await setDoc(doc(db, 'admins', cleanId), newProfile);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `${profile.role === 'STUDENT' ? 'students' : 'admins'}/${cleanId}`);
  }

  // 2. Add to centralized user registry for fast cross-device duplicate checks
  try {
    await setDoc(doc(db, 'system_config', 'user_registry'), {
      [cleanId]: newProfile,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch {
    // Non-blocking fallback
  }

  // 3. Save to local cache
  saveLocalUser(newProfile);

  // Background audit log
  recordAuditLog({
    eventId: `LOG_REG_${cleanId}_${Date.now()}`,
    outpassId: 'SYSTEM_USER',
    action: `USER_REGISTRATION_${newProfile.role}`,
    actorRole: newProfile.role,
    actorName: newProfile.name,
    actorId: newProfile.uniqueId,
    timestamp: new Date().toISOString(),
    remarks: `User registered with ID ${newProfile.uniqueId} for ${newProfile.role} (${newProfile.hostelBlock || 'All Hostels'})`,
    academicYear: getAcademicYear()
  }).catch(() => {});

  return { success: true, user: newProfile };
}

/**
 * Authenticates user by role and Unique ID / Email across Firestore & local cache.
 */
export async function loginUser(role: Role, identifier: string, password?: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const clean = identifier.trim().toLowerCase();
  const cleanId = normalizeId(identifier);

  let foundUser: UserProfile | null = null;

  // 1. Direct fetch from role-authorized collection
  try {
    if (role === 'STUDENT') {
      const snap = await getDoc(doc(db, 'students', cleanId));
      if (snap.exists()) {
        foundUser = snap.data() as UserProfile;
      }
    } else {
      const snap = await getDoc(doc(db, 'admins', cleanId));
      if (snap.exists()) {
        foundUser = snap.data() as UserProfile;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `${role === 'STUDENT' ? 'students' : 'admins'}/${cleanId}`);
  }

  // 2. Check centralized user registry document
  if (!foundUser) {
    try {
      const regSnap = await getDoc(doc(db, 'system_config', 'user_registry'));
      if (regSnap.exists()) {
        const data = regSnap.data() as Record<string, UserProfile>;
        if (data) {
          if (data[cleanId]) {
            foundUser = data[cleanId];
          } else {
            // Check by email
            const matched = Object.values(data).find(
              u => u && typeof u === 'object' && u.email && u.email.toLowerCase() === clean
            );
            if (matched) {
              foundUser = matched;
            }
          }
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // 3. Fallback to local cache
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
      error: `No ${role} account found with ID or Email "${identifier}". Please check your credentials or register a new account.`
    };
  }

  if (foundUser.role !== role) {
    return {
      success: false,
      error: `This account is registered as ${foundUser.role}, not ${role}. Please switch to the ${foundUser.role} portal.`
    };
  }

  if (foundUser.password && password && foundUser.password !== password) {
    return { success: false, error: 'Incorrect password. Please try again.' };
  }

  // Sync to local cache for instant future access
  saveLocalUser(foundUser);

  return { success: true, user: foundUser };
}

/**
 * Creates an Outpass Application with ultra-low latency push
 */
export async function createOutpass(
  data: Omit<OutpassRequest, 'outpassId' | 'status' | 'verificationToken' | 'academicYear' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; outpass?: OutpassRequest; error?: string }> {
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

  // 1. Save to local cache immediately (0ms)
  saveLocalRequest(request);

  // 2. Broadcast immediately on local channels (<2ms)
  notifyLocalSync(request);

  // 3. Write directly to individual requests document in Firestore
  try {
    await setDoc(doc(db, 'requests', outpassId), request);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `requests/${outpassId}`);
  }

  // 4. Update centralized real-time registry in system_config (triggers cross-device onSnapshot push)
  try {
    await setDoc(doc(db, 'system_config', 'outpass_registry'), {
      outpassesMap: {
        [outpassId]: request
      },
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch {
    // Non-blocking fallback
  }

  // 5. Update specialized hostel block database partition
  if (request.hostelBlock) {
    const blockKey = normalizeId(request.hostelBlock);
    try {
      await setDoc(doc(db, 'system_config', `block_${blockKey}`), {
        blockKey,
        blockName: request.hostelBlock,
        outpassesMap: {
          [outpassId]: request
        },
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch {
      // Non-blocking fallback
    }
  }

  // 6. Record audit log asynchronously in the background
  recordAuditLog({
    eventId: `LOG_REQ_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'OUTPASS_CREATED',
    actorRole: 'STUDENT',
    actorName: request.studentName,
    actorId: request.studentRegNo,
    timestamp: new Date().toISOString(),
    remarks: `Application submitted for destination: ${request.destination} (${request.proposedDays} days) • Block: ${request.hostelBlock}`,
    academicYear: request.academicYear
  }).catch(() => {});

  return { success: true, outpass: request };
}

/**
 * Fetch fresh outpasses directly from server with minimum latency
 */
export async function fetchOutpassesFromServer(): Promise<OutpassRequest[]> {
  try {
    const snap = await getDoc(doc(db, 'system_config', 'outpass_registry'));
    if (snap.exists()) {
      const data = snap.data();
      const map = data.outpassesMap as Record<string, OutpassRequest> | undefined;
      const list: OutpassRequest[] = [];

      if (map) {
        Object.values(map).forEach(req => {
          if (req && req.outpassId) {
            list.push(req);
            saveLocalRequest(req);
          }
        });
      }

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (list.length > 0) {
        return list;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'system_config/outpass_registry');
  }

  return getLocalRequests();
}

/**
 * Real-time ultra-low latency subscription to Outpasses
 * Subscribes to system_config/outpass_registry via onSnapshot.
 * Delivers sub-second updates across all mobile phones, tablets, and laptops!
 */
export function subscribeToOutpasses(
  callback: (requests: OutpassRequest[], isNewArrival?: boolean) => void
): () => void {
  let knownIds = new Set<string>();
  getLocalRequests().forEach(r => knownIds.add(r.outpassId));

  const processSnapshot = (snapshotDocs: OutpassRequest[]) => {
    let hasNewArrival = false;
    snapshotDocs.forEach(r => {
      if (!knownIds.has(r.outpassId) && r.status === 'PENDING_RC') {
        hasNewArrival = true;
      }
      knownIds.add(r.outpassId);
    });

    snapshotDocs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    snapshotDocs.forEach(item => saveLocalRequest(item));
    callback(snapshotDocs, hasNewArrival);
  };

  // 1. Initial immediate delivery from local cache (0ms perceived latency)
  const initialLocal = getLocalRequests();
  if (initialLocal.length > 0) {
    callback(initialLocal, false);
  }

  // 2. Primary Firestore onSnapshot on system_config/outpass_registry
  let unsubscribeFirestore = () => {};
  try {
    unsubscribeFirestore = onSnapshot(
      doc(db, 'system_config', 'outpass_registry'),
      { includeMetadataChanges: true },
      snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const map = data.outpassesMap as Record<string, OutpassRequest> | undefined;
        const list: OutpassRequest[] = [];
        if (map) {
          Object.values(map).forEach(r => {
            if (r && r.outpassId) {
              list.push(r);
            }
          });
        }
        if (list.length > 0) {
          processSnapshot(list);
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, 'system_config/outpass_registry');
        fetchOutpassesFromServer().then(list => processSnapshot(list));
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'system_config/outpass_registry');
  }

  // 3. Low-Latency 2.5-second Heartbeat
  const intervalId = setInterval(async () => {
    if (typeof document !== 'undefined' && document.hidden) return; // Conserve battery
    try {
      const snap = await getDoc(doc(db, 'system_config', 'outpass_registry'));
      if (snap.exists()) {
        const map = snap.data().outpassesMap as Record<string, OutpassRequest> | undefined;
        if (map) {
          const list = Object.values(map).filter(r => r && r.outpassId);
          if (list.length > 0) {
            processSnapshot(list);
          }
        }
      }
    } catch {
      // Ignore background heartbeat error
    }
  }, 2500);

  // 4. Instant wake-up on Mobile Unlock / Tab Focus / Network Online
  const handleWakeUp = () => {
    ensureFirestoreActive().catch(() => {});
    fetchOutpassesFromServer().then(list => processSnapshot(list));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('online', handleWakeUp);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleWakeUp();
      }
    });

    // 5. Cross-tab instant storage event
    window.addEventListener('storage', (e) => {
      if (e.key === 'mit_last_sync_timestamp' || e.key === LOCAL_REQUESTS_KEY) {
        callback(getLocalRequests(), true);
      }
    });

    // 6. BroadcastChannel message handler
    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        if (event.data?.type === 'OUTPASS_UPDATED') {
          const fresh = getLocalRequests();
          processSnapshot(fresh);
        }
      };
    }
  }

  return () => {
    unsubscribeFirestore();
    clearInterval(intervalId);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('online', handleWakeUp);
    }
  };
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
  const newStatus: OutpassStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  const rcDecision = {
    decision,
    rcId: rcUser.uniqueId,
    rcName: rcUser.name,
    remarks: remarks || (decision === 'APPROVED' ? 'Approved by Resident Counsellor' : 'Declined by Resident Counsellor'),
    parentCallVerified,
    decidedAt
  };

  // 1. Optimistic update in local cache (0ms)
  let updatedReq: OutpassRequest | undefined;
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      updatedReq = { ...r, status: newStatus, rcDecision, updatedAt: decidedAt };
      return updatedReq;
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  if (updatedReq) {
    notifyLocalSync(updatedReq);
  }

  // 2. Commit to Firestore
  try {
    await setDoc(doc(db, 'requests', outpassId), {
      status: newStatus,
      rcDecision,
      updatedAt: decidedAt
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  // 3. Update centralized registry for instant push to students & gatekeepers
  if (updatedReq) {
    try {
      await setDoc(doc(db, 'system_config', 'outpass_registry'), {
        outpassesMap: {
          [outpassId]: updatedReq
        },
        lastUpdated: decidedAt
      }, { merge: true });

      if (updatedReq.hostelBlock) {
        const blockKey = normalizeId(updatedReq.hostelBlock);
        await setDoc(doc(db, 'system_config', `block_${blockKey}`), {
          outpassesMap: {
            [outpassId]: updatedReq
          },
          lastUpdated: decidedAt
        }, { merge: true });
      }
    } catch {
      // Non-blocking
    }
  }

  // 4. Background audit log
  recordAuditLog({
    eventId: `LOG_RC_${outpassId}_${Date.now()}`,
    outpassId,
    action: `RC_${decision}`,
    actorRole: 'RC',
    actorName: rcUser.name,
    actorId: rcUser.uniqueId,
    timestamp: decidedAt,
    remarks: `${decision} by RC. Parent Call Verified: ${parentCallVerified ? 'YES' : 'NO'}. Remarks: ${remarks}`,
    academicYear: getAcademicYear()
  }).catch(() => {});

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
  const gateLogs = {
    departedAt: timestamp,
    departedGatekeeperId: gatekeeperUser.uniqueId,
    departedGatekeeperName: gatekeeperUser.name,
    departedGatePost: gatekeeperUser.gateLocation || 'Main Gate',
    securityNote: securityNote || 'Passed security check at gate'
  };

  let updatedReq: OutpassRequest | undefined;
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      updatedReq = {
        ...r,
        status: 'OUT_OF_CAMPUS' as const,
        gateLogs: {
          ...r.gateLogs,
          ...gateLogs
        },
        updatedAt: timestamp
      };
      return updatedReq;
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  if (updatedReq) {
    notifyLocalSync(updatedReq);
  }

  try {
    await setDoc(doc(db, 'requests', outpassId), {
      status: 'OUT_OF_CAMPUS',
      gateLogs: updatedReq?.gateLogs || gateLogs,
      updatedAt: timestamp
    }, { merge: true });

    if (updatedReq) {
      await setDoc(doc(db, 'system_config', 'outpass_registry'), {
        outpassesMap: {
          [outpassId]: updatedReq
        },
        lastUpdated: timestamp
      }, { merge: true });

      if (updatedReq.hostelBlock) {
        const blockKey = normalizeId(updatedReq.hostelBlock);
        await setDoc(doc(db, 'system_config', `block_${blockKey}`), {
          outpassesMap: {
            [outpassId]: updatedReq
          },
          lastUpdated: timestamp
        }, { merge: true });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  recordAuditLog({
    eventId: `LOG_GATE_OUT_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'GATE_CAMPUS_EXIT',
    actorRole: 'GATEKEEPER',
    actorName: gatekeeperUser.name,
    actorId: gatekeeperUser.uniqueId,
    timestamp,
    remarks: `Student exited campus through ${gatekeeperUser.gateLocation || 'Main Gate'}. Note: ${securityNote || 'None'}`,
    academicYear: getAcademicYear()
  }).catch(() => {});

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

  let updatedReq: OutpassRequest | undefined;
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      const updatedLogs = {
        ...r.gateLogs,
        returnedAt: timestamp,
        returnedGatekeeperId: gatekeeperUser.uniqueId,
        returnedGatekeeperName: gatekeeperUser.name,
        returnedGatePost: gatekeeperUser.gateLocation || 'Main Gate',
        isLate,
        securityNote: securityNote || (isLate ? 'Returned past expected curfew' : 'Returned on time')
      };
      updatedReq = {
        ...r,
        status: 'RETURNED_TO_CAMPUS' as const,
        gateLogs: updatedLogs,
        updatedAt: timestamp
      };
      return updatedReq;
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  if (updatedReq) {
    notifyLocalSync(updatedReq);
  }

  try {
    await setDoc(doc(db, 'requests', outpassId), {
      status: 'RETURNED_TO_CAMPUS',
      gateLogs: updatedReq?.gateLogs,
      updatedAt: timestamp
    }, { merge: true });

    if (updatedReq) {
      await setDoc(doc(db, 'system_config', 'outpass_registry'), {
        outpassesMap: {
          [outpassId]: updatedReq
        },
        lastUpdated: timestamp
      }, { merge: true });

      if (updatedReq.hostelBlock) {
        const blockKey = normalizeId(updatedReq.hostelBlock);
        await setDoc(doc(db, 'system_config', `block_${blockKey}`), {
          outpassesMap: {
            [outpassId]: updatedReq
          },
          lastUpdated: timestamp
        }, { merge: true });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  recordAuditLog({
    eventId: `LOG_GATE_IN_${outpassId}_${Date.now()}`,
    outpassId,
    action: 'GATE_CAMPUS_ENTRY',
    actorRole: 'GATEKEEPER',
    actorName: gatekeeperUser.name,
    actorId: gatekeeperUser.uniqueId,
    timestamp,
    remarks: `Student returned to campus. Is Late: ${isLate ? 'YES (OVERDUE)' : 'NO (ON TIME)'}. Note: ${securityNote || 'Normal entry'}`,
    academicYear: getAcademicYear()
  }).catch(() => {});

  return { success: true, isLate };
}

/**
 * Executive Warden Action: Sanction or Decline Outpass / Medical Holiday
 */
export async function ewEndorseOutpass(
  outpassId: string,
  decision: 'APPROVED' | 'REJECTED',
  remarks: string,
  ewUser: UserProfile
): Promise<boolean> {
  const decidedAt = new Date().toISOString();
  const newStatus: OutpassStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  const ewDecision = {
    decision,
    ewId: ewUser.uniqueId,
    ewName: ewUser.name,
    remarks: remarks || (decision === 'APPROVED' ? 'Sanctioned by Executive Warden' : 'Declined by Executive Warden'),
    decidedAt
  };

  let updatedReq: OutpassRequest | undefined;
  const local = getLocalRequests().map(r => {
    if (r.outpassId === outpassId) {
      updatedReq = { ...r, status: newStatus, ewDecision, updatedAt: decidedAt };
      return updatedReq;
    }
    return r;
  });
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(local));

  if (updatedReq) {
    notifyLocalSync(updatedReq);
  }

  try {
    await setDoc(doc(db, 'requests', outpassId), {
      status: newStatus,
      ewDecision,
      updatedAt: decidedAt
    }, { merge: true });

    if (updatedReq) {
      await setDoc(doc(db, 'system_config', 'outpass_registry'), {
        outpassesMap: {
          [outpassId]: updatedReq
        },
        lastUpdated: decidedAt
      }, { merge: true });

      if (updatedReq.hostelBlock) {
        const blockKey = normalizeId(updatedReq.hostelBlock);
        await setDoc(doc(db, 'system_config', `block_${blockKey}`), {
          outpassesMap: {
            [outpassId]: updatedReq
          },
          lastUpdated: decidedAt
        }, { merge: true });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `requests/${outpassId}`);
  }

  recordAuditLog({
    eventId: `LOG_EW_${outpassId}_${Date.now()}`,
    outpassId,
    action: `EW_${decision}`,
    actorRole: 'EW',
    actorName: ewUser.name,
    actorId: ewUser.uniqueId,
    timestamp: decidedAt,
    remarks: `Sanctioned by Executive Warden. Remarks: ${remarks}`,
    academicYear: getAcademicYear()
  }).catch(() => {});

  return true;
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
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Low-latency audio chime synthesizer using Web Audio API
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    playTone(587.33, 0, 0.15); // D5
    playTone(880.00, 0.12, 0.25); // A5
  } catch {
    // Audio context may be muted or restricted before user gesture
  }
}

// =========================================================================
// EXECUTIVE WARDEN STATISTICAL AGGREGATION ENGINE
// =========================================================================

export const BASELINE_BLOCK_CAPACITIES: Record<string, number> = {
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

export const TOTAL_CAMPUS_CAPACITY = Object.values(BASELINE_BLOCK_CAPACITIES).reduce((acc, v) => acc + v, 0); // 950 inmates

/**
 * Computes Executive Warden summary metrics strictly distinguishing:
 * - Native place: approved unused vs exited (verified gate departure) vs returned
 * - Medical leave: approved unused vs exited/currently away vs returned
 * - Hostel status: registered, verified present, verified away, approved unused, unverified
 * Note: Does NOT expose diagnoses or medical notes.
 */
export function getEWSummaryStats(
  requests: OutpassRequest[],
  blockFilter: string = 'ALL',
  dateRange?: { start?: string; end?: string }
): EWDashboardSummary {
  // 1. Filter requests by block and date if provided
  let filtered = requests;
  if (blockFilter !== 'ALL') {
    filtered = filtered.filter(r => r.hostelBlock === blockFilter);
  }
  if (dateRange?.start) {
    const s = new Date(dateRange.start).getTime();
    filtered = filtered.filter(r => new Date(r.departureDateTime).getTime() >= s);
  }
  if (dateRange?.end) {
    const e = new Date(dateRange.end).getTime();
    filtered = filtered.filter(r => new Date(r.departureDateTime).getTime() <= e);
  }

  // A. Students at Native Place
  // Count students whose approved outpass indicates native-place travel
  const nativeRequests = filtered.filter(r => isNativePlaceRequest(r));
  const nativeApprovedUnused = nativeRequests.filter(
    r => r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt)
  ).length;
  const nativeCurrentlyAway = nativeRequests.filter(
    r => r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)
  ).length;
  const nativeReturned = nativeRequests.filter(
    r => r.status === 'RETURNED_TO_CAMPUS'
  ).length;
  const nativeTotalApproved = nativeApprovedUnused + nativeCurrentlyAway;

  // B. Medical-Leave Outpasses
  // Sanitization-related operational workflow: approved unused vs away vs returned
  const medicalApprovedReqs = filtered.filter(r => isApprovedMedicalRequest(r));
  const medicalApprovedUnused = medicalApprovedReqs.filter(
    r => r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt)
  ).length;
  const medicalCurrentlyAway = medicalApprovedReqs.filter(
    r => r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)
  ).length;
  const medicalReturned = medicalApprovedReqs.filter(
    r => r.status === 'RETURNED_TO_CAMPUS'
  ).length;
  const medicalTotalApproved = medicalApprovedUnused + medicalCurrentlyAway;

  // C. Current Hostel Status
  // Registered capacity for filtered block or whole campus
  const totalRegistered = blockFilter !== 'ALL'
    ? (BASELINE_BLOCK_CAPACITIES[blockFilter] || 80)
    : TOTAL_CAMPUS_CAPACITY;

  // Currently away verified by gate departure
  const allVerifiedAway = filtered.filter(
    r => r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)
  ).length;

  // Approved but unused outpasses (student still physically in hostel)
  const allApprovedUnused = filtered.filter(
    r => r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt)
  ).length;

  // Verified present = registered minus verified away
  const currentlyPresent = Math.max(0, totalRegistered - allVerifiedAway);

  // Unverified count: Outpasses marked pending or without clear gate timestamps
  const unverifiedCount = filtered.filter(
    r => r.status === 'PENDING_RC' || (r.status === 'OUT_OF_CAMPUS' && !r.gateLogs?.departedAt)
  ).length;

  const presencePercentage = Number(((currentlyPresent / Math.max(1, totalRegistered)) * 100).toFixed(1));

  // Block breakdown matrix
  const blockBreakdown: Record<string, {
    registered: number;
    present: number;
    away: number;
    approvedUnused: number;
    nativeAway: number;
    medicalAway: number;
  }> = {};

  HOSTEL_BLOCKS.forEach(b => {
    const reg = BASELINE_BLOCK_CAPACITIES[b] || 80;
    const bReqs = requests.filter(r => r.hostelBlock === b);
    const bAway = bReqs.filter(r => r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)).length;
    const bPresent = Math.max(0, reg - bAway);
    const bAppUnused = bReqs.filter(r => r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt)).length;
    const bNatAway = bReqs.filter(r => isNativePlaceRequest(r) && r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)).length;
    const bMedAway = bReqs.filter(r => isApprovedMedicalRequest(r) && r.status === 'OUT_OF_CAMPUS' && Boolean(r.gateLogs?.departedAt)).length;

    blockBreakdown[b] = {
      registered: reg,
      present: bPresent,
      away: bAway,
      approvedUnused: bAppUnused,
      nativeAway: bNatAway,
      medicalAway: bMedAway
    };
  });

  return {
    nativePlace: {
      approvedUnused: nativeApprovedUnused,
      currentlyAway: nativeCurrentlyAway,
      returned: nativeReturned,
      totalApproved: nativeTotalApproved
    },
    medicalLeave: {
      approvedUnused: medicalApprovedUnused,
      currentlyAway: medicalCurrentlyAway,
      returned: medicalReturned,
      totalApproved: medicalTotalApproved
    },
    hostelStatus: {
      totalRegistered,
      currentlyPresent,
      currentlyAway: allVerifiedAway,
      approvedUnused: allApprovedUnused,
      unverifiedCount,
      presencePercentage,
      isEstimated: true // Explicitly flagged as estimate based on verified gate records
    },
    blockBreakdown,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Returns privacy-sanitized drill-down records for sanitation operations.
 * CRITICAL PRIVACY PROTECTION:
 * Strips out diseaseType, medicalDetails, clinical notes, and prescription flags.
 * Exposes strictly minimum operational fields: student name, reg no, block, room, departure/return dates, status.
 */
export function getSanitizedOperationalSanitationRecords(
  requests: OutpassRequest[],
  blockFilter: string = 'ALL'
): OperationalSanitationRecord[] {
  const filtered = requests.filter(r => {
    if (blockFilter !== 'ALL' && r.hostelBlock !== blockFilter) return false;
    return isApprovedMedicalRequest(r);
  });

  return filtered.map(r => {
    let gateStatus: OperationalSanitationRecord['gateStatus'] = 'PENDING';
    if (r.status === 'APPROVED' && (!r.gateLogs || !r.gateLogs.departedAt)) {
      gateStatus = 'APPROVED_NOT_DEPARTED';
    } else if (r.status === 'OUT_OF_CAMPUS') {
      gateStatus = 'CURRENTLY_AWAY';
    } else if (r.status === 'RETURNED_TO_CAMPUS') {
      gateStatus = 'RETURNED';
    }

    return {
      outpassId: r.outpassId,
      studentName: r.studentName,
      studentRegNo: r.studentRegNo,
      hostelBlock: r.hostelBlock,
      roomNumber: r.roomNumber,
      departureDateTime: r.departureDateTime,
      returnDateTime: r.returnDateTime,
      status: r.status,
      gateStatus,
      departedAt: r.gateLogs?.departedAt,
      returnedAt: r.gateLogs?.returnedAt,
      emergencyContact: r.parentPhone || r.studentPhone,
      updatedAt: r.updatedAt
    };
  });
}

// =========================================================================
// HOLIDAY HOSTEL OCCUPANCY & MESS COUNT MODULE
// =========================================================================

export const DEFAULT_HOLIDAY_PERIODS: HolidayPeriod[] = [
  {
    id: 'deepavali-2026',
    name: 'Deepavali Festival Vacation 2026',
    startDate: '2026-11-06',
    endDate: '2026-11-12',
    submissionDeadline: '2026-11-04T18:00:00.000Z',
    academicYear: '2026-2027',
    description: 'Mandatory declaration for hostel stay and mess catering arrangements during Deepavali vacation break.',
    isActive: true
  },
  {
    id: 'winter-break-2026',
    name: 'Semester Winter Vacation 2026',
    startDate: '2026-12-18',
    endDate: '2027-01-03',
    submissionDeadline: '2026-12-15T18:00:00.000Z',
    academicYear: '2026-2027',
    description: 'End-semester winter holidays and hostel mess operation planning window.',
    isActive: true
  },
  {
    id: 'pongal-2027',
    name: 'Pongal Festival Holidays 2027',
    startDate: '2027-01-13',
    endDate: '2027-01-19',
    submissionDeadline: '2027-01-11T18:00:00.000Z',
    academicYear: '2026-2027',
    description: 'Tamil harvest festival holiday break mess headcount schedule.',
    isActive: true
  }
];

export function getLocalHolidayPeriods(): HolidayPeriod[] {
  if (typeof localStorage === 'undefined') return DEFAULT_HOLIDAY_PERIODS;
  try {
    const raw = localStorage.getItem(LOCAL_HOLIDAY_PERIODS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_HOLIDAY_PERIODS;
  } catch {
    return DEFAULT_HOLIDAY_PERIODS;
  }
}

export function saveLocalHolidayPeriods(periods: HolidayPeriod[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_HOLIDAY_PERIODS_KEY, JSON.stringify(periods));
  } catch {
    // Ignore
  }
}

export function getLocalHolidayDeclarations(): HolidayDeclaration[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_HOLIDAY_DECLARATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalHolidayDeclaration(dec: HolidayDeclaration) {
  if (typeof localStorage === 'undefined') return;
  try {
    const list = getLocalHolidayDeclarations().filter(d => d.id !== dec.id);
    list.unshift(dec);
    localStorage.setItem(LOCAL_HOLIDAY_DECLARATIONS_KEY, JSON.stringify(list));
  } catch {
    // Ignore
  }
}

/**
 * Fetch active holiday periods from Firestore or local fallback
 */
export async function getHolidayPeriods(): Promise<HolidayPeriod[]> {
  try {
    const snap = await getDoc(doc(db, 'system_config', 'holiday_periods'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.periods) && data.periods.length > 0) {
        saveLocalHolidayPeriods(data.periods);
        return data.periods;
      }
    }
  } catch {
    // Fallback to local
  }
  return getLocalHolidayPeriods();
}

/**
 * Fetch a single holiday period by ID
 */
export async function getHolidayPeriodById(periodId: string): Promise<HolidayPeriod | null> {
  const periods = await getHolidayPeriods();
  return periods.find(p => p.id === periodId) || null;
}

/**
 * Fetch existing declaration for a specific student and holiday period.
 * Ensures student can view and update their own existing declaration.
 */
export async function getStudentHolidayDeclaration(
  studentRegNo: string,
  periodId: string
): Promise<HolidayDeclaration | null> {
  const cleanRegNo = normalizeId(studentRegNo);
  const declarationId = `DEC_${periodId}_${cleanRegNo}`;

  // 1. Direct Firestore fetch
  try {
    const snap = await getDoc(doc(db, 'holiday_declarations', declarationId));
    if (snap.exists()) {
      const dec = snap.data() as HolidayDeclaration;
      saveLocalHolidayDeclaration(dec);
      return dec;
    }
  } catch {
    // Fallback to local cache
  }

  // 2. Check local cache
  const local = getLocalHolidayDeclarations().find(d => d.id === declarationId);
  return local || null;
}

/**
 * Fetch all declarations for a holiday period (for Mess Staff & EW).
 */
export async function getAllHolidayDeclarations(periodId: string): Promise<HolidayDeclaration[]> {
  // 1. Check system_config partition
  try {
    const snap = await getDoc(doc(db, 'system_config', `holiday_declarations_${periodId}`));
    if (snap.exists()) {
      const data = snap.data();
      if (data.declarationsMap) {
        const list = Object.values(data.declarationsMap) as HolidayDeclaration[];
        list.forEach(d => saveLocalHolidayDeclaration(d));
        return list;
      }
    }
  } catch {
    // Fallback
  }

  // 2. Local cache fallback
  return getLocalHolidayDeclarations().filter(d => d.periodId === periodId);
}

/**
 * Submits or Updates a student's holiday hostel & mess declaration.
 * - Prevents duplicate declarations (strictly unique per student + period)
 * - Updates existing declaration rather than duplicating
 * - Validates submission deadline
 * - Validates date bounds within holiday period
 * - Logs audit action
 */
export async function submitHolidayDeclaration(
  declarationData: {
    studentId: string;
    studentRegNo: string;
    studentName: string;
    hostelBlock: string;
    roomNumber: string;
    periodId: string;
    stayingInHostel: boolean;
    presenceDates: string[];
    mealsByDate: Record<string, DailyMealRequirement>;
    operationalNotes?: string;
  },
  actorUser: UserProfile
): Promise<{ success: boolean; declaration?: HolidayDeclaration; error?: string }> {
  const cleanRegNo = normalizeId(declarationData.studentRegNo);
  if (!cleanRegNo) {
    return { success: false, error: 'A valid student register number is required.' };
  }

  // 1. Validate Period
  const period = await getHolidayPeriodById(declarationData.periodId);
  if (!period) {
    return { success: false, error: 'Selected holiday period is invalid or not found.' };
  }

  // 2. Deadline Check (unless EW/Admin)
  if (actorUser.role === 'STUDENT') {
    const deadlineTime = new Date(period.submissionDeadline).getTime();
    if (Date.now() > deadlineTime) {
      return { 
        success: false, 
        error: `Submission deadline (${new Date(period.submissionDeadline).toLocaleString('en-IN')}) for this holiday period has passed. Please contact the Executive Warden office for manual accommodation permits.` 
      };
    }
  }

  // 3. Date Bounds Validation
  const periodStart = new Date(period.startDate).getTime();
  const periodEnd = new Date(period.endDate).getTime();

  if (declarationData.stayingInHostel) {
    if (!declarationData.presenceDates || declarationData.presenceDates.length === 0) {
      return { success: false, error: 'Please select at least one expected date of presence in the hostel.' };
    }

    for (const d of declarationData.presenceDates) {
      const t = new Date(d).getTime();
      if (t < periodStart || t > periodEnd) {
        return { success: false, error: `Presence date ${d} falls outside the holiday period (${period.startDate} to ${period.endDate}).` };
      }
    }
  }

  const declarationId = `DEC_${declarationData.periodId}_${cleanRegNo}`;
  const now = new Date().toISOString();

  // Check for existing declaration to preserve original submittedAt timestamp
  const existing = await getStudentHolidayDeclaration(declarationData.studentRegNo, declarationData.periodId);
  const isUpdate = Boolean(existing);

  const cleanDeclaration: HolidayDeclaration = {
    id: declarationId,
    studentId: declarationData.studentId,
    studentRegNo: declarationData.studentRegNo.trim(),
    studentName: declarationData.studentName.trim(),
    hostelBlock: declarationData.hostelBlock.trim(),
    roomNumber: declarationData.roomNumber.trim(),
    periodId: declarationData.periodId,
    stayingInHostel: declarationData.stayingInHostel,
    presenceDates: declarationData.stayingInHostel ? declarationData.presenceDates.sort() : [],
    mealsByDate: declarationData.stayingInHostel ? declarationData.mealsByDate : {},
    operationalNotes: declarationData.operationalNotes ? declarationData.operationalNotes.trim().slice(0, 300) : '',
    submittedAt: existing?.submittedAt || now,
    updatedAt: now,
    academicYear: period.academicYear || getAcademicYear()
  };

  // 4. Save to Local Cache (0ms)
  saveLocalHolidayDeclaration(cleanDeclaration);

  // 5. Commit to Firestore
  try {
    await setDoc(doc(db, 'holiday_declarations', declarationId), cleanDeclaration, { merge: true });
    
    // Centralized partition for instant aggregate reads
    await setDoc(doc(db, 'system_config', `holiday_declarations_${period.id}`), {
      periodId: period.id,
      declarationsMap: {
        [declarationId]: cleanDeclaration
      },
      lastUpdated: now
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `holiday_declarations/${declarationId}`);
  }

  // 6. Record Audit Log
  recordAuditLog({
    eventId: `LOG_HOLIDAY_${declarationId}_${Date.now()}`,
    outpassId: declarationId,
    action: isUpdate ? 'HOLIDAY_DECLARATION_UPDATED' : 'HOLIDAY_DECLARATION_SUBMITTED',
    actorRole: actorUser.role,
    actorName: actorUser.name,
    actorId: actorUser.uniqueId,
    timestamp: now,
    remarks: `${isUpdate ? 'Updated' : 'Submitted'} holiday presence declaration for ${period.name}. Staying: ${cleanDeclaration.stayingInHostel ? 'YES' : 'NO'}. Dates: ${cleanDeclaration.presenceDates.length} days.`,
    academicYear: cleanDeclaration.academicYear
  }).catch(() => {});

  return { success: true, declaration: cleanDeclaration };
}

/**
 * Generates dates list between start and end (inclusive)
 */
export function generateDateRangeList(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * Computes Mess Planning Report for authorized staff:
 * - Expected students staying per date
 * - Expected breakfast, lunch, and dinner counts
 * - Breakdown by hostel block
 * - Submission rate & list of non-respondents (WITHOUT assuming non-respondents are absent or present)
 * - Reporting period and disclaimer
 */
export async function calculateMessPlanningReport(
  periodId: string,
  allStudentsList?: UserProfile[]
): Promise<MessPlanningReport> {
  const period = await getHolidayPeriodById(periodId) || DEFAULT_HOLIDAY_PERIODS[0];
  const declarations = await getAllHolidayDeclarations(period.id);
  const allUsers = allStudentsList || getLocalUsers();
  const registeredStudents = allUsers.filter(u => u.role === 'STUDENT');

  const totalRegisteredStudents = Math.max(registeredStudents.length, TOTAL_CAMPUS_CAPACITY);
  const totalSubmissions = declarations.length;
  const submissionRate = Number(((totalSubmissions / Math.max(1, registeredStudents.length)) * 100).toFixed(1));

  // Identify non-respondents without assuming they are absent or present
  const respondedRegNos = new Set(declarations.map(d => normalizeId(d.studentRegNo)));
  const nonRespondents = registeredStudents
    .filter(s => !respondedRegNos.has(normalizeId(s.uniqueId)))
    .map(s => ({
      studentRegNo: s.uniqueId,
      studentName: s.name,
      hostelBlock: s.hostelBlock || 'Unassigned',
      roomNumber: s.roomNumber || 'N/A'
    }));

  // Daily aggregations across the period
  const dateList = generateDateRangeList(period.startDate, period.endDate);
  const dailyReports: MessDailyReport[] = dateList.map(date => {
    let expectedOccupancy = 0;
    let breakfastCount = 0;
    let lunchCount = 0;
    let dinnerCount = 0;

    const blockBreakdown: Record<string, {
      occupancy: number;
      breakfast: number;
      lunch: number;
      dinner: number;
    }> = {};

    HOSTEL_BLOCKS.forEach(b => {
      blockBreakdown[b] = { occupancy: 0, breakfast: 0, lunch: 0, dinner: 0 };
    });

    declarations.forEach(dec => {
      if (dec.stayingInHostel && dec.presenceDates.includes(date)) {
        expectedOccupancy++;
        const meals = dec.mealsByDate[date];
        const hasBreakfast = meals ? Boolean(meals.breakfast) : true;
        const hasLunch = meals ? Boolean(meals.lunch) : true;
        const hasDinner = meals ? Boolean(meals.dinner) : true;

        if (hasBreakfast) breakfastCount++;
        if (hasLunch) lunchCount++;
        if (hasDinner) dinnerCount++;

        const block = dec.hostelBlock || 'Marutham';
        if (!blockBreakdown[block]) {
          blockBreakdown[block] = { occupancy: 0, breakfast: 0, lunch: 0, dinner: 0 };
        }
        blockBreakdown[block].occupancy++;
        if (hasBreakfast) blockBreakdown[block].breakfast++;
        if (hasLunch) blockBreakdown[block].lunch++;
        if (hasDinner) blockBreakdown[block].dinner++;
      }
    });

    return {
      date,
      expectedOccupancy,
      breakfastCount,
      lunchCount,
      dinnerCount,
      blockBreakdown
    };
  });

  return {
    period,
    lastUpdated: new Date().toISOString(),
    totalRegisteredStudents,
    totalSubmissions,
    submissionRate,
    nonRespondentsCount: nonRespondents.length,
    nonRespondents,
    dailyReports,
    disclaimer: 'Official Planning Estimates: Aggregate mess counts and occupancy figures are calculated strictly from submitted student declarations. Students who have not yet responded are tracked as pending and are NOT assumed to be either present or absent.'
  };
}

/**
 * Seed initial demo data safely ONCE to ensure all devices see instant baseline data
 */
export async function seedInitialDemoData(): Promise<void> {
  const seedUsers: UserProfile[] = [
    {
      id: 'USR_2026503040',
      uniqueId: '2026503040',
      role: 'STUDENT',
      name: 'Vibin Appachi',
      email: 'vibin.2026503040@annauniv.edu',
      phone: '9363622865',
      parentPhone: '9363622865',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'I',
      password: 'password123',
      createdAt: '2026-10-23T16:00:00.000Z'
    },
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
      id: 'USR_2024508012',
      uniqueId: '2024508012',
      role: 'STUDENT',
      name: 'M. Naveen Kumar',
      email: 'naveen.2024508012@annauniv.edu',
      phone: '+91 94433 11223',
      hostelBlock: 'Kaveri',
      roomNumber: '108',
      branch: 'Information Technology (IT)',
      year: 'II',
      parentPhone: '+91 94433 99887',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_2024509033',
      uniqueId: '2024509033',
      role: 'STUDENT',
      name: 'P. Priya Dharshini',
      email: 'priya.2024509033@annauniv.edu',
      phone: '+91 98765 43219',
      hostelBlock: 'Amaravathi',
      roomNumber: '402',
      branch: 'Electronics & Communication Engineering (ECE)',
      year: 'II',
      parentPhone: '+91 98765 11111',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    },
    {
      id: 'USR_RC-983',
      uniqueId: 'RC-983',
      role: 'RC',
      name: 'Robert',
      email: 'robert.rc@mitindia.edu',
      phone: '9876543210',
      hostelBlock: 'Thamirabarani',
      designation: 'Resident Counsellor (Thamirabarani Block)',
      password: 'password123',
      createdAt: '2026-10-23T16:00:00.000Z'
    },
    {
      id: 'USR_RC-MANICKAM',
      uniqueId: 'RC-MANICKAM',
      role: 'RC',
      name: 'Dr. R. Manickam',
      email: 'rc.manickam@mitindia.edu',
      phone: '+91 98410 77889',
      hostelBlock: 'Marutham',
      designation: 'Resident Counsellor (Marutham Block)',
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
    },
    {
      id: 'USR_MESS-CHEF-01',
      uniqueId: 'MESS-CHEF-01',
      role: 'MESS_STAFF',
      name: 'K. Arumugam (Hostel Mess Supervisor)',
      email: 'mess.supervisor@mitindia.edu',
      phone: '+91 94445 67890',
      designation: 'Hostel Mess Supervisor & Catering Head',
      password: 'password123',
      createdAt: '2024-08-01T08:00:00.000Z'
    }
  ];

  for (const u of seedUsers) {
    saveLocalUser(u);
  }

  // Pre-seed realistic outpasses covering:
  // - Native Place: Approved (not exited), Exited (currently away), Returned
  // - Medical Leave: Approved (not exited), Exited (currently away), Returned
  const sampleRequests: OutpassRequest[] = [
    // 1. Native Place - Currently Away (Verified gate departure)
    {
      outpassId: 'OP-2026-1042',
      studentId: 'USR_2026503040',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'I',
      studentPhone: '9363622865',
      parentPhone: '9363622865',
      destination: 'Madurai (Native Place)',
      visitAddress: '12 Koodal Nagar, Madurai',
      purpose: 'Family visit to native place',
      category: 'NATIVE',
      isNativePlace: true,
      proposedDays: 3,
      departureDateTime: '2026-10-25T10:00:00.000Z',
      returnDateTime: '2026-10-28T18:00:00.000Z',
      status: 'OUT_OF_CAMPUS',
      gateLogs: {
        departedAt: '2026-10-25T10:15:00.000Z',
        departedGatekeeperId: 'SEC-GATE-01',
        departedGatekeeperName: 'M. Selvam',
        departedGatePost: 'Main Gate (GST Road)',
        securityNote: 'Exited through Main Gate with valid luggage'
      },
      rcDecision: {
        decision: 'APPROVED',
        rcId: 'RC-983',
        rcName: 'Robert',
        remarks: 'Parent call verified',
        parentCallVerified: true,
        decidedAt: '2026-10-24T18:00:00.000Z'
      },
      verificationToken: 'TOKEN-NAT-1042',
      academicYear: '2026-2027',
      createdAt: '2026-10-24T14:00:00.000Z',
      updatedAt: '2026-10-25T10:15:00.000Z'
    },
    // 2. Native Place - Approved Unused (Not exited yet)
    {
      outpassId: 'OP-2026-1088',
      studentId: 'USR_2022506042',
      studentName: 'K. Vigneshwaran',
      studentRegNo: '2022506042',
      hostelBlock: 'Marutham',
      roomNumber: '204',
      branch: 'Artificial Intelligence & Data Science (AI&DS)',
      year: 'III',
      studentPhone: '+91 98401 23456',
      parentPhone: '+91 94441 98765',
      destination: 'Coimbatore (Hometown)',
      visitAddress: '45 Gandhipuram, Coimbatore',
      purpose: 'Visiting parents at native hometown',
      category: 'NATIVE',
      isNativePlace: true,
      proposedDays: 4,
      departureDateTime: '2026-10-28T06:00:00.000Z',
      returnDateTime: '2026-11-01T20:00:00.000Z',
      status: 'APPROVED',
      rcDecision: {
        decision: 'APPROVED',
        rcId: 'RC-MANICKAM',
        rcName: 'Dr. R. Manickam',
        remarks: 'Approved for native travel',
        parentCallVerified: true,
        decidedAt: '2026-10-27T08:30:00.000Z'
      },
      verificationToken: 'TOKEN-NAT-1088',
      academicYear: '2026-2027',
      createdAt: '2026-10-26T19:00:00.000Z',
      updatedAt: '2026-10-27T08:30:00.000Z'
    },
    // 3. Native Place - Returned to Campus
    {
      outpassId: 'OP-2026-0955',
      studentId: 'USR_2024508012',
      studentName: 'M. Naveen Kumar',
      studentRegNo: '2024508012',
      hostelBlock: 'Kaveri',
      roomNumber: '108',
      branch: 'Information Technology (IT)',
      year: 'II',
      studentPhone: '+91 94433 11223',
      parentPhone: '+91 94433 99887',
      destination: 'Salem (Native Place)',
      visitAddress: '7 Fairlands, Salem',
      purpose: 'Family wedding at native town',
      category: 'NATIVE',
      isNativePlace: true,
      proposedDays: 2,
      departureDateTime: '2026-10-20T08:00:00.000Z',
      returnDateTime: '2026-10-22T20:00:00.000Z',
      status: 'RETURNED_TO_CAMPUS',
      gateLogs: {
        departedAt: '2026-10-20T08:30:00.000Z',
        departedGatekeeperId: 'SEC-GATE-01',
        departedGatekeeperName: 'M. Selvam',
        returnedAt: '2026-10-22T19:15:00.000Z',
        returnedGatekeeperId: 'SEC-GATE-01',
        returnedGatekeeperName: 'M. Selvam',
        isLate: false,
        securityNote: 'Returned on time'
      },
      verificationToken: 'TOKEN-NAT-0955',
      academicYear: '2026-2027',
      createdAt: '2026-10-19T10:00:00.000Z',
      updatedAt: '2026-10-22T19:15:00.000Z'
    },
    // 4. Medical Leave - Currently Away (Exited campus for home recovery)
    {
      outpassId: 'OP-2026-2201',
      studentId: 'USR_2023504018',
      studentName: 'Ananya R.',
      studentRegNo: '2023504018',
      hostelBlock: 'Thamirabarani',
      roomNumber: '312',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'II',
      studentPhone: '+91 97910 54321',
      parentPhone: '+91 98840 87654',
      destination: 'Tiruchirappalli',
      visitAddress: 'Thillai Nagar, Trichy',
      purpose: 'Medical home rest as advised by physician',
      category: 'MEDICAL',
      isMedicalLeave: true,
      diseaseType: 'Viral Fever / High Temperature',
      medicalDetails: {
        diseaseType: 'Viral Fever / High Temperature',
        hospitalClinic: 'MIT Health Centre & Dr. Mehta',
        doctorName: 'Dr. S. Revathi',
        bedRestDays: 5,
        symptoms: 'Fever 102F and chills',
        prescriptionUploaded: true
      },
      proposedDays: 5,
      departureDateTime: '2026-10-24T12:00:00.000Z',
      returnDateTime: '2026-10-29T18:00:00.000Z',
      status: 'OUT_OF_CAMPUS',
      gateLogs: {
        departedAt: '2026-10-24T12:45:00.000Z',
        departedGatekeeperId: 'SEC-GATE-01',
        departedGatekeeperName: 'M. Selvam',
        departedGatePost: 'Main Gate (GST Road)',
        securityNote: 'Medical escort provided by guardian'
      },
      rcDecision: {
        decision: 'APPROVED',
        rcId: 'RC-983',
        rcName: 'Robert',
        remarks: 'Medical certificate verified',
        parentCallVerified: true,
        decidedAt: '2026-10-24T11:00:00.000Z'
      },
      verificationToken: 'TOKEN-MED-2201',
      academicYear: '2026-2027',
      createdAt: '2026-10-24T09:00:00.000Z',
      updatedAt: '2026-10-24T12:45:00.000Z'
    },
    // 5. Medical Leave - Approved Unused (Sanctioned, preparing to depart)
    {
      outpassId: 'OP-2026-2244',
      studentId: 'USR_2024509033',
      studentName: 'P. Priya Dharshini',
      studentRegNo: '2024509033',
      hostelBlock: 'Amaravathi',
      roomNumber: '402',
      branch: 'Electronics & Communication Engineering (ECE)',
      year: 'II',
      studentPhone: '+91 98765 43219',
      parentPhone: '+91 98765 11111',
      destination: 'Vellore',
      visitAddress: 'Katpadi, Vellore',
      purpose: 'Orthopedic sprain recovery at home',
      category: 'MEDICAL',
      isMedicalLeave: true,
      diseaseType: 'Orthopedic / Fracture / Ligament Tear',
      medicalDetails: {
        diseaseType: 'Orthopedic / Fracture / Ligament Tear',
        hospitalClinic: 'Apollo Speciality Hospitals',
        doctorName: 'Dr. K. Balaji',
        bedRestDays: 7,
        prescriptionUploaded: true
      },
      proposedDays: 7,
      departureDateTime: '2026-10-27T18:00:00.000Z',
      returnDateTime: '2026-11-03T18:00:00.000Z',
      status: 'APPROVED',
      rcDecision: {
        decision: 'APPROVED',
        rcId: 'RC-MANICKAM',
        rcName: 'Dr. R. Manickam',
        remarks: 'Approved on medical recommendation',
        parentCallVerified: true,
        decidedAt: '2026-10-27T10:00:00.000Z'
      },
      verificationToken: 'TOKEN-MED-2244',
      academicYear: '2026-2027',
      createdAt: '2026-10-27T07:00:00.000Z',
      updatedAt: '2026-10-27T10:00:00.000Z'
    },
    // 6. Medical Leave - Returned Safely
    {
      outpassId: 'OP-2026-2180',
      studentId: 'USR_2026503040',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'I',
      studentPhone: '9363622865',
      parentPhone: '9363622865',
      destination: 'Madurai',
      visitAddress: 'Koodal nagar',
      purpose: 'Viral fever recovery',
      category: 'MEDICAL',
      isMedicalLeave: true,
      diseaseType: 'Viral Fever / High Temperature',
      medicalDetails: {
        diseaseType: 'Viral Fever / High Temperature',
        hospitalClinic: 'MIT Health Centre'
      },
      proposedDays: 3,
      departureDateTime: '2026-10-18T10:00:00.000Z',
      returnDateTime: '2026-10-21T18:00:00.000Z',
      status: 'RETURNED_TO_CAMPUS',
      gateLogs: {
        departedAt: '2026-10-18T10:30:00.000Z',
        departedGatekeeperId: 'SEC-GATE-01',
        returnedAt: '2026-10-21T17:40:00.000Z',
        returnedGatekeeperId: 'SEC-GATE-01',
        isLate: false
      },
      verificationToken: 'TOKEN-MED-2180',
      academicYear: '2026-2027',
      createdAt: '2026-10-18T08:00:00.000Z',
      updatedAt: '2026-10-21T17:40:00.000Z'
    }
  ];

  for (const r of sampleRequests) {
    saveLocalRequest(r);
  }

  // Pre-seed holiday periods and sample declarations
  saveLocalHolidayPeriods(DEFAULT_HOLIDAY_PERIODS);

  const sampleDeclarations: HolidayDeclaration[] = [
    {
      id: 'DEC_deepavali-2026_2022506042',
      studentId: 'USR_2022506042',
      studentRegNo: '2022506042',
      studentName: 'K. Vigneshwaran',
      hostelBlock: 'Marutham',
      roomNumber: '204',
      periodId: 'deepavali-2026',
      stayingInHostel: true,
      presenceDates: ['2026-11-06', '2026-11-07', '2026-11-08'],
      mealsByDate: {
        '2026-11-06': { breakfast: true, lunch: true, dinner: true },
        '2026-11-07': { breakfast: true, lunch: true, dinner: true },
        '2026-11-08': { breakfast: true, lunch: false, dinner: true }
      },
      operationalNotes: 'Preparing for gate exam coaching classes',
      submittedAt: '2026-10-25T10:00:00.000Z',
      updatedAt: '2026-10-25T10:00:00.000Z',
      academicYear: '2026-2027'
    },
    {
      id: 'DEC_deepavali-2026_2026503040',
      studentId: 'USR_2026503040',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      periodId: 'deepavali-2026',
      stayingInHostel: false,
      presenceDates: [],
      mealsByDate: {},
      operationalNotes: 'Traveling home to Madurai for Diwali celebration with parents',
      submittedAt: '2026-10-26T14:30:00.000Z',
      updatedAt: '2026-10-26T14:30:00.000Z',
      academicYear: '2026-2027'
    },
    {
      id: 'DEC_deepavali-2026_2024508012',
      studentId: 'USR_2024508012',
      studentName: 'M. Naveen Kumar',
      studentRegNo: '2024508012',
      hostelBlock: 'Kaveri',
      roomNumber: '108',
      periodId: 'deepavali-2026',
      stayingInHostel: true,
      presenceDates: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'],
      mealsByDate: {
        '2026-11-06': { breakfast: true, lunch: true, dinner: true },
        '2026-11-07': { breakfast: true, lunch: true, dinner: true },
        '2026-11-08': { breakfast: true, lunch: true, dinner: true },
        '2026-11-09': { breakfast: true, lunch: true, dinner: true },
        '2026-11-10': { breakfast: true, lunch: true, dinner: true },
        '2026-11-11': { breakfast: true, lunch: true, dinner: true },
        '2026-11-12': { breakfast: true, lunch: true, dinner: true }
      },
      operationalNotes: 'Library project research',
      submittedAt: '2026-10-26T18:00:00.000Z',
      updatedAt: '2026-10-26T18:00:00.000Z',
      academicYear: '2026-2027'
    }
  ];

  for (const d of sampleDeclarations) {
    saveLocalHolidayDeclaration(d);
  }

  if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_FLAG_KEY)) {
    return;
  }

  try {
    // 1. Seed users to system_config/user_registry
    const userMap: Record<string, UserProfile> = {};
    for (const u of seedUsers) {
      userMap[normalizeId(u.uniqueId)] = u;
    }
    await setDoc(doc(db, 'system_config', 'user_registry'), userMap, { merge: true });

    // 2. Seed outpasses to system_config/outpass_registry
    const outpassMap: Record<string, OutpassRequest> = {};
    for (const r of sampleRequests) {
      outpassMap[r.outpassId] = r;
      // also write to requests collection
      await setDoc(doc(db, 'requests', r.outpassId), r, { merge: true });
    }
    await setDoc(doc(db, 'system_config', 'outpass_registry'), {
      outpassesMap: outpassMap,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // 3. Seed holiday periods
    await setDoc(doc(db, 'system_config', 'holiday_periods'), {
      periods: DEFAULT_HOLIDAY_PERIODS,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    // 4. Seed sample declarations
    const decMap: Record<string, HolidayDeclaration> = {};
    for (const d of sampleDeclarations) {
      decMap[d.id] = d;
      await setDoc(doc(db, 'holiday_declarations', d.id), d, { merge: true });
    }
    await setDoc(doc(db, 'system_config', 'holiday_declarations_deepavali-2026'), {
      periodId: 'deepavali-2026',
      declarationsMap: decMap,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    localStorage.setItem(SEED_FLAG_KEY, 'true');
  } catch {
    // Non-blocking fallback to local cache
  }
}

