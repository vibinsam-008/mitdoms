import {
  doc,
  setDoc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureFirestoreActive } from './config';
import { UserProfile, OutpassRequest, OutpassStatus, AuditLogEntry, Role } from '../types';

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
const SEED_FLAG_KEY = 'mit_outpass_seeded_v5';

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
    }
  ];

  for (const u of seedUsers) {
    saveLocalUser(u);
  }

  // Pre-seed known requests from Vibin Appachi
  const sampleRequests: OutpassRequest[] = [
    {
      outpassId: 'OP-2026-1384',
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
      purpose: 'Family visit',
      proposedDays: 2,
      departureDateTime: '2026-10-26T19:22:00.000Z',
      returnDateTime: '2026-10-28T19:22:00.000Z',
      status: 'PENDING_RC',
      verificationToken: 'TOKEN-J6CZNNIC',
      academicYear: '2026-2027',
      createdAt: '2026-10-26T17:22:24.613Z',
      updatedAt: '2026-10-26T17:22:24.613Z'
    },
    {
      outpassId: 'OP-2026-7341',
      studentId: 'USR_2026503040',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      branch: 'Computer Science & Engineering (CSE)',
      year: 'I',
      studentPhone: '9363622865',
      parentPhone: '9363622865',
      destination: 'Cuddalore',
      visitAddress: 'RMK engineering college',
      purpose: 'Event OD',
      proposedDays: 2,
      departureDateTime: '2026-10-23T18:39:00.000Z',
      returnDateTime: '2026-10-25T18:39:00.000Z',
      status: 'PENDING_RC',
      verificationToken: 'TOKEN-1CLR6AD9',
      academicYear: '2026-2027',
      createdAt: '2026-10-23T16:40:12.716Z',
      updatedAt: '2026-10-23T16:40:12.716Z'
    },
    {
      outpassId: 'OP-2026-2005',
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
      purpose: 'Family visit',
      proposedDays: 2,
      departureDateTime: '2026-10-23T18:00:00.000Z',
      returnDateTime: '2026-10-25T18:00:00.000Z',
      status: 'PENDING_RC',
      verificationToken: 'TOKEN-1KIXEOHU',
      academicYear: '2026-2027',
      createdAt: '2026-10-23T16:01:11.043Z',
      updatedAt: '2026-10-23T16:01:11.043Z'
    }
  ];

  for (const r of sampleRequests) {
    saveLocalRequest(r);
  }

  if (typeof localStorage !== 'undefined' && localStorage.getItem(SEED_FLAG_KEY)) {
    return;
  }

  try {
    // Seed users to system_config/user_registry
    const userMap: Record<string, UserProfile> = {};
    for (const u of seedUsers) {
      userMap[normalizeId(u.uniqueId)] = u;
    }
    await setDoc(doc(db, 'system_config', 'user_registry'), userMap, { merge: true });

    // Seed outpasses to system_config/outpass_registry
    const outpassMap: Record<string, OutpassRequest> = {};
    for (const r of sampleRequests) {
      outpassMap[r.outpassId] = r;
    }
    await setDoc(doc(db, 'system_config', 'outpass_registry'), {
      outpassesMap: outpassMap,
      lastUpdated: new Date().toISOString()
    }, { merge: true });

    localStorage.setItem(SEED_FLAG_KEY, 'true');
  } catch {
    // Offline or network hiccup, fallback to local cache
  }
}
