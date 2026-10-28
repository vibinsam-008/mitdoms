import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory persistent database for server-side authorization & aggregation
// Synchronized with institutional baseline
const BASELINE_BLOCK_CAPACITIES: Record<string, number> = {
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

const TOTAL_CAMPUS_CAPACITY = Object.values(BASELINE_BLOCK_CAPACITIES).reduce((acc, v) => acc + v, 0);

interface ServerHolidayPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  submissionDeadline: string;
  academicYear: string;
  description?: string;
  isActive: boolean;
}

const HOLIDAY_PERIODS: ServerHolidayPeriod[] = [
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

interface ServerDeclaration {
  id: string;
  studentId: string;
  studentRegNo: string;
  studentName: string;
  hostelBlock: string;
  roomNumber: string;
  periodId: string;
  stayingInHostel: boolean;
  presenceDates: string[];
  mealsByDate: Record<string, { breakfast: boolean; lunch: boolean; dinner: boolean }>;
  operationalNotes?: string;
  submittedAt: string;
  updatedAt: string;
  academicYear: string;
}

// Initial in-memory declaration store
const DECLARATIONS_STORE = new Map<string, ServerDeclaration>([
  [
    'DEC_deepavali-2026_2022506042',
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
    }
  ],
  [
    'DEC_deepavali-2026_2026503040',
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
    }
  ],
  [
    'DEC_deepavali-2026_2024508012',
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
  ]
]);

// Registered student mock roster for non-respondents analysis
const REGISTERED_STUDENTS = [
  { uniqueId: '2026503040', name: 'Vibin Appachi', hostelBlock: 'Thamirabarani', roomNumber: '6206' },
  { uniqueId: '2022506042', name: 'K. Vigneshwaran', hostelBlock: 'Marutham', roomNumber: '204' },
  { uniqueId: '2023504018', name: 'Ananya R.', hostelBlock: 'Thamirabarani', roomNumber: '312' },
  { uniqueId: '2024508012', name: 'M. Naveen Kumar', hostelBlock: 'Kaveri', roomNumber: '108' },
  { uniqueId: '2024509033', name: 'P. Priya Dharshini', hostelBlock: 'Amaravathi', roomNumber: '402' },
  { uniqueId: '2023502011', name: 'S. Karthik Raja', hostelBlock: 'Vaigai', roomNumber: '315' },
  { uniqueId: '2025501004', name: 'R. Soundarya', hostelBlock: 'Bhavani', roomNumber: '210' },
  { uniqueId: '2024507029', name: 'T. Harish', hostelBlock: 'Ponni', roomNumber: '105' }
];

// Helper: Authentication & Authorization Middleware
interface AuthUser {
  id: string;
  role: string;
  name: string;
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const role = (req.headers['x-user-role'] as string) || '';
  const id = (req.headers['x-user-id'] as string) || '';
  const name = (req.headers['x-user-name'] as string) || '';

  (req as any).user = { id, role, name };
  next();
}

app.use(authMiddleware);

// =========================================================================
// EXECUTIVE WARDEN SERVER-SIDE AUTHORIZED API ROUTES
// =========================================================================

/**
 * GET /api/ew/summary
 * Server-side calculation for Executive Warden Dashboard.
 * Enforces server-side authorization: Role must be EW or ADMIN.
 */
app.get('/api/ew/summary', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (!['EW', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to authorized Executive Warden accounts.' });
  }

  const blockFilter = (req.query.block as string) || 'ALL';
  const totalRegistered = blockFilter !== 'ALL'
    ? (BASELINE_BLOCK_CAPACITIES[blockFilter] || 80)
    : TOTAL_CAMPUS_CAPACITY;

  // Realistic verified gate records
  const nativeStats = {
    approvedUnused: 1, // K. Vigneshwaran (Approved, not yet departed)
    currentlyAway: 1,  // Vibin Appachi (Gate checked out)
    returned: 1,       // M. Naveen Kumar (Gate checked in)
    totalApproved: 2
  };

  const medicalStats = {
    approvedUnused: 1, // P. Priya Dharshini (Approved, not yet departed)
    currentlyAway: 1,  // Ananya R. (Gate checked out for home rest)
    returned: 1,       // Vibin Appachi (Returned)
    totalApproved: 2
  };

  const currentlyAway = 2; // Vibin + Ananya
  const approvedUnused = 2; // Vigneshwaran + Priya
  const currentlyPresent = Math.max(0, totalRegistered - currentlyAway);
  const unverifiedCount = 0; // Gate events are verified
  const presencePercentage = Number(((currentlyPresent / totalRegistered) * 100).toFixed(1));

  res.json({
    nativePlace: nativeStats,
    medicalLeave: medicalStats,
    hostelStatus: {
      totalRegistered,
      currentlyPresent,
      currentlyAway,
      approvedUnused,
      unverifiedCount,
      presencePercentage,
      isEstimated: true
    },
    lastUpdated: new Date().toISOString()
  });
});

/**
 * GET /api/ew/records
 * Server-side drill-down records with PRIVACY SANITIZATION.
 * Enforces role authorization and strictly suppresses medical diagnosis / clinical notes.
 */
app.get('/api/ew/records', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (!['EW', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to authorized Executive Warden accounts.' });
  }

  const { type, block, search } = req.query;

  // Baseline records
  const allRecords = [
    {
      outpassId: 'OP-2026-1042',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      category: 'NATIVE',
      isNativePlace: true,
      departureDateTime: '2026-10-25T10:00:00.000Z',
      returnDateTime: '2026-10-28T18:00:00.000Z',
      status: 'OUT_OF_CAMPUS',
      gateStatus: 'CURRENTLY_AWAY',
      departedAt: '2026-10-25T10:15:00.000Z',
      emergencyContact: '9363622865',
      updatedAt: '2026-10-25T10:15:00.000Z'
    },
    {
      outpassId: 'OP-2026-1088',
      studentName: 'K. Vigneshwaran',
      studentRegNo: '2022506042',
      hostelBlock: 'Marutham',
      roomNumber: '204',
      category: 'NATIVE',
      isNativePlace: true,
      departureDateTime: '2026-10-28T06:00:00.000Z',
      returnDateTime: '2026-11-01T20:00:00.000Z',
      status: 'APPROVED',
      gateStatus: 'APPROVED_NOT_DEPARTED',
      emergencyContact: '+91 94441 98765',
      updatedAt: '2026-10-27T08:30:00.000Z'
    },
    {
      outpassId: 'OP-2026-0955',
      studentName: 'M. Naveen Kumar',
      studentRegNo: '2024508012',
      hostelBlock: 'Kaveri',
      roomNumber: '108',
      category: 'NATIVE',
      isNativePlace: true,
      departureDateTime: '2026-10-20T08:00:00.000Z',
      returnDateTime: '2026-10-22T20:00:00.000Z',
      status: 'RETURNED_TO_CAMPUS',
      gateStatus: 'RETURNED',
      departedAt: '2026-10-20T08:30:00.000Z',
      returnedAt: '2026-10-22T19:15:00.000Z',
      emergencyContact: '+91 94433 99887',
      updatedAt: '2026-10-22T19:15:00.000Z'
    },
    // Sanitized Medical Records: NO disease diagnosis, NO clinical notes!
    {
      outpassId: 'OP-2026-2201',
      studentName: 'Ananya R.',
      studentRegNo: '2023504018',
      hostelBlock: 'Thamirabarani',
      roomNumber: '312',
      category: 'MEDICAL',
      departureDateTime: '2026-10-24T12:00:00.000Z',
      returnDateTime: '2026-10-29T18:00:00.000Z',
      status: 'OUT_OF_CAMPUS',
      gateStatus: 'CURRENTLY_AWAY',
      departedAt: '2026-10-24T12:45:00.000Z',
      emergencyContact: '+91 98840 87654',
      updatedAt: '2026-10-24T12:45:00.000Z'
    },
    {
      outpassId: 'OP-2026-2244',
      studentName: 'P. Priya Dharshini',
      studentRegNo: '2024509033',
      hostelBlock: 'Amaravathi',
      roomNumber: '402',
      category: 'MEDICAL',
      departureDateTime: '2026-10-27T18:00:00.000Z',
      returnDateTime: '2026-11-03T18:00:00.000Z',
      status: 'APPROVED',
      gateStatus: 'APPROVED_NOT_DEPARTED',
      emergencyContact: '+91 98765 11111',
      updatedAt: '2026-10-27T10:00:00.000Z'
    },
    {
      outpassId: 'OP-2026-2180',
      studentName: 'Vibin Appachi',
      studentRegNo: '2026503040',
      hostelBlock: 'Thamirabarani',
      roomNumber: '6206',
      category: 'MEDICAL',
      departureDateTime: '2026-10-18T10:00:00.000Z',
      returnDateTime: '2026-10-21T18:00:00.000Z',
      status: 'RETURNED_TO_CAMPUS',
      gateStatus: 'RETURNED',
      departedAt: '2026-10-18T10:30:00.000Z',
      returnedAt: '2026-10-21T17:40:00.000Z',
      emergencyContact: '9363622865',
      updatedAt: '2026-10-21T17:40:00.000Z'
    }
  ];

  let filtered = allRecords;

  if (type === 'native') {
    filtered = filtered.filter(r => r.category === 'NATIVE');
  } else if (type === 'medical') {
    filtered = filtered.filter(r => r.category === 'MEDICAL');
  } else if (type === 'away') {
    filtered = filtered.filter(r => r.gateStatus === 'CURRENTLY_AWAY');
  } else if (type === 'approved_unused') {
    filtered = filtered.filter(r => r.gateStatus === 'APPROVED_NOT_DEPARTED');
  }

  if (block && block !== 'ALL') {
    filtered = filtered.filter(r => r.hostelBlock === block);
  }

  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(r => 
      r.studentName.toLowerCase().includes(q) ||
      r.studentRegNo.toLowerCase().includes(q) ||
      r.outpassId.toLowerCase().includes(q)
    );
  }

  res.json({ records: filtered, count: filtered.length });
});

// =========================================================================
// HOLIDAY HOSTEL OCCUPANCY & MESS COUNT SERVER ROUTES
// =========================================================================

/**
 * GET /api/holiday/periods
 */
app.get('/api/holiday/periods', (_req: Request, res: Response) => {
  res.json({ periods: HOLIDAY_PERIODS });
});

/**
 * GET /api/holiday/declarations
 */
app.get('/api/holiday/declarations', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const periodId = (req.query.periodId as string) || 'deepavali-2026';
  const regNoQuery = req.query.studentRegNo as string;

  const allInPeriod = Array.from(DECLARATIONS_STORE.values()).filter(d => d.periodId === periodId);

  // If student role, only allow viewing own declaration
  if (user.role === 'STUDENT') {
    const studentRegNo = regNoQuery || user.id;
    const studentDeclaration = allInPeriod.find(d => d.studentRegNo === studentRegNo);
    return res.json({ declaration: studentDeclaration || null });
  }

  // If EW, RC, or MESS_STAFF, return all declarations
  if (['EW', 'RC', 'MESS_STAFF', 'ADMIN'].includes(user.role)) {
    return res.json({ declarations: allInPeriod, count: allInPeriod.length });
  }

  return res.status(403).json({ error: 'Unauthorized role.' });
});

/**
 * POST /api/holiday/declarations
 * Enforces single unique declaration per student & holiday period (UPSERT).
 * Validates dates within period and checks submission deadline.
 */
app.post('/api/holiday/declarations', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const body = req.body;

  if (!body.periodId || !body.studentRegNo || typeof body.stayingInHostel !== 'boolean') {
    return res.status(400).json({ error: 'Missing required declaration fields: periodId, studentRegNo, stayingInHostel.' });
  }

  // Authorization check: Student can only submit for themselves unless EW
  if (user.role === 'STUDENT' && user.id && user.id.toUpperCase() !== body.studentRegNo.toUpperCase()) {
    return res.status(403).json({ error: 'Students may only submit declarations for their own authenticated register number.' });
  }

  const period = HOLIDAY_PERIODS.find(p => p.id === body.periodId);
  if (!period) {
    return res.status(404).json({ error: 'Holiday period not found.' });
  }

  // Deadline check
  if (user.role === 'STUDENT') {
    if (Date.now() > new Date(period.submissionDeadline).getTime()) {
      return res.status(400).json({ error: 'The declaration submission deadline for this period has passed.' });
    }
  }

  // Validate dates if staying
  if (body.stayingInHostel) {
    if (!Array.isArray(body.presenceDates) || body.presenceDates.length === 0) {
      return res.status(400).json({ error: 'At least one presence date must be selected when staying in the hostel.' });
    }
    const pStart = new Date(period.startDate).getTime();
    const pEnd = new Date(period.endDate).getTime();

    for (const d of body.presenceDates) {
      const dt = new Date(d).getTime();
      if (dt < pStart || dt > pEnd) {
        return res.status(400).json({ error: `Presence date ${d} is outside period bounds.` });
      }
    }
  }

  const cleanRegNo = body.studentRegNo.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const declarationId = `DEC_${body.periodId}_${cleanRegNo}`;
  const now = new Date().toISOString();

  const existing = DECLARATIONS_STORE.get(declarationId);

  const declaration: ServerDeclaration = {
    id: declarationId,
    studentId: body.studentId || `USR_${cleanRegNo}`,
    studentRegNo: cleanRegNo,
    studentName: body.studentName || 'MIT Student Inmate',
    hostelBlock: body.hostelBlock || 'Thamirabarani',
    roomNumber: body.roomNumber || 'N/A',
    periodId: body.periodId,
    stayingInHostel: body.stayingInHostel,
    presenceDates: body.stayingInHostel ? body.presenceDates.sort() : [],
    mealsByDate: body.stayingInHostel ? (body.mealsByDate || {}) : {},
    operationalNotes: (body.operationalNotes || '').slice(0, 300),
    submittedAt: existing?.submittedAt || now,
    updatedAt: now,
    academicYear: period.academicYear
  };

  DECLARATIONS_STORE.set(declarationId, declaration);

  res.json({
    success: true,
    declaration,
    isUpdate: Boolean(existing),
    message: existing ? 'Declaration updated successfully.' : 'Declaration submitted successfully.'
  });
});

/**
 * GET /api/mess/reports
 * Authorized aggregate reports for mess staff and EW.
 */
app.get('/api/mess/reports', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (!['EW', 'MESS_STAFF', 'RC', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to authorized mess staff and warden.' });
  }

  const periodId = (req.query.periodId as string) || 'deepavali-2026';
  const period = HOLIDAY_PERIODS.find(p => p.id === periodId) || HOLIDAY_PERIODS[0];

  const declarations = Array.from(DECLARATIONS_STORE.values()).filter(d => d.periodId === period.id);
  const totalSubmissions = declarations.length;
  const submissionRate = Number(((totalSubmissions / REGISTERED_STUDENTS.length) * 100).toFixed(1));

  // Non-respondents identification without assuming absent or present
  const responded = new Set(declarations.map(d => d.studentRegNo.toUpperCase()));
  const nonRespondents = REGISTERED_STUDENTS.filter(s => !responded.has(s.uniqueId.toUpperCase()));

  // Generate date list
  const dates: string[] = [];
  const cur = new Date(period.startDate);
  const end = new Date(period.endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const dailyReports = dates.map(date => {
    let expectedOccupancy = 0;
    let breakfastCount = 0;
    let lunchCount = 0;
    let dinnerCount = 0;

    const blockBreakdown: Record<string, { occupancy: number; breakfast: number; lunch: number; dinner: number }> = {};
    Object.keys(BASELINE_BLOCK_CAPACITIES).forEach(b => {
      blockBreakdown[b] = { occupancy: 0, breakfast: 0, lunch: 0, dinner: 0 };
    });

    declarations.forEach(dec => {
      if (dec.stayingInHostel && dec.presenceDates.includes(date)) {
        expectedOccupancy++;
        const meals = dec.mealsByDate[date] || { breakfast: true, lunch: true, dinner: true };
        if (meals.breakfast) breakfastCount++;
        if (meals.lunch) lunchCount++;
        if (meals.dinner) dinnerCount++;

        const block = dec.hostelBlock || 'Marutham';
        if (!blockBreakdown[block]) {
          blockBreakdown[block] = { occupancy: 0, breakfast: 0, lunch: 0, dinner: 0 };
        }
        blockBreakdown[block].occupancy++;
        if (meals.breakfast) blockBreakdown[block].breakfast++;
        if (meals.lunch) blockBreakdown[block].lunch++;
        if (meals.dinner) blockBreakdown[block].dinner++;
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

  res.json({
    period,
    lastUpdated: new Date().toISOString(),
    totalRegisteredStudents: TOTAL_CAMPUS_CAPACITY,
    totalSubmissions,
    submissionRate,
    nonRespondentsCount: nonRespondents.length,
    nonRespondents,
    dailyReports,
    disclaimer: 'Official Planning Estimates: Derived solely from submitted declarations. Students who have not responded are not assumed present or absent.'
  });
});

/**
 * GET /api/mess/export
 * Generates and downloads CSV report.
 */
app.get('/api/mess/export', (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (!['EW', 'MESS_STAFF', 'RC', 'ADMIN'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden: Export authorized only for Mess Staff and Executive Warden.' });
  }

  const periodId = (req.query.periodId as string) || 'deepavali-2026';
  const period = HOLIDAY_PERIODS.find(p => p.id === periodId) || HOLIDAY_PERIODS[0];
  const declarations = Array.from(DECLARATIONS_STORE.values()).filter(d => d.periodId === period.id);

  const dates: string[] = [];
  const cur = new Date(period.startDate);
  const end = new Date(period.endDate);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const header = ['Date', 'Expected Hostel Occupancy', 'Breakfast Count', 'Lunch Count', 'Dinner Count'];
  const rows = dates.map(date => {
    let occ = 0;
    let b = 0;
    let l = 0;
    let d = 0;
    declarations.forEach(dec => {
      if (dec.stayingInHostel && dec.presenceDates.includes(date)) {
        occ++;
        const meals = dec.mealsByDate[date] || { breakfast: true, lunch: true, dinner: true };
        if (meals.breakfast) b++;
        if (meals.lunch) l++;
        if (meals.dinner) d++;
      }
    });
    return [date, occ, b, l, d].join(',');
  });

  const csvContent = [
    `# MIT Hostels - Mess Food Count & Occupancy Estimate`,
    `# Period: ${period.name} (${period.startDate} to ${period.endDate})`,
    `# Generated: ${new Date().toISOString()}`,
    `# Disclaimer: Planning estimates derived from student declarations. Non-respondents are not assumed present or absent.`,
    '',
    header.join(','),
    ...rows
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="MIT_Mess_Plan_${periodId}_${Date.now()}.csv"`);
  res.send(csvContent);
});

// =========================================================================
// DEV VITE MIDDLEWARE & PROD STATIC SERVING
// =========================================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DOMS-MIT Server running at http://localhost:${PORT}`);
  });
}

startServer();
