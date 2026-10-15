/**
 * Gym Module — SQLite service
 * Tables: gym_plans, gym_members, gym_attendance, gym_payments
 */
import { getDB } from './sqlite';
import { createNotification } from './notificationService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GymPlan {
  id: string;
  businessId: string;
  name: string;
  durationDays: number;    // 30 = monthly, 90 = quarterly, 365 = annual
  price: number;
  description?: string;
  isActive: number;        // 1 = active, 0 = archived
  lastUpdated: string;
}

export interface GymMember {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  cnic?: string;
  address?: string;
  emergencyContact?: string;
  gender?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  joiningDate: string;
  planId: string;
  planName: string;
  planPrice: number;
  membershipStart: string;
  membershipEnd: string;
  status: 'active' | 'expired' | 'paused' | 'cancelled';
  feeStatus: 'paid' | 'due' | 'overdue';
  lastFeeDate?: string;
  // BMI
  heightCm?: number;
  weightKg?: number;
  notes?: string;
  lastUpdated: string;
  deleted?: number;
}

export interface GymPayment {
  id: string;
  businessId: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
  amount: number;
  month: string;           // YYYY-MM
  paidDate: string;
  notes?: string;
  createdBy: string;
  lastUpdated: string;
}

export interface GymAttendance {
  id: string;
  businessId: string;
  memberId: string;
  memberName: string;
  checkIn: string;         // ISO datetime
  checkOut?: string;
  date: string;            // YYYY-MM-DD
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initGymTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS gym_plans (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      name TEXT NOT NULL,
      durationDays INTEGER DEFAULT 30,
      price REAL DEFAULT 0,
      description TEXT,
      isActive INTEGER DEFAULT 1,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS gym_members (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      cnic TEXT,
      address TEXT,
      emergencyContact TEXT,
      gender TEXT,
      dateOfBirth TEXT,
      joiningDate TEXT,
      planId TEXT,
      planName TEXT,
      planPrice REAL DEFAULT 0,
      membershipStart TEXT,
      membershipEnd TEXT,
      status TEXT DEFAULT 'active',
      feeStatus TEXT DEFAULT 'due',
      lastFeeDate TEXT,
      heightCm REAL,
      weightKg REAL,
      notes TEXT,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gym_payments (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      memberName TEXT,
      planId TEXT,
      planName TEXT,
      amount REAL DEFAULT 0,
      month TEXT,
      paidDate TEXT,
      notes TEXT,
      createdBy TEXT,
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS gym_attendance (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      memberName TEXT,
      checkIn TEXT,
      checkOut TEXT,
      date TEXT
    );
  `);

  // Seed default plans if none exist for this run (handled at screen level)
}

// ─── Plans CRUD ───────────────────────────────────────────────────────────────

export async function getGymPlans(businessId: string): Promise<GymPlan[]> {
  const db = await getDB();
  return db.getAllAsync<GymPlan>(
    'SELECT * FROM gym_plans WHERE businessId = ? ORDER BY price ASC',
    [businessId]
  );
}

export async function upsertGymPlan(plan: GymPlan): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO gym_plans (id, businessId, name, durationDays, price, description, isActive, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       durationDays = excluded.durationDays,
       price = excluded.price,
       description = excluded.description,
       isActive = excluded.isActive,
       lastUpdated = excluded.lastUpdated`,
    [plan.id, plan.businessId, plan.name, plan.durationDays, plan.price,
     plan.description ?? '', plan.isActive, plan.lastUpdated]
  );
}

export async function deleteGymPlan(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE gym_plans SET isActive = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]);
}

// ─── Members CRUD ─────────────────────────────────────────────────────────────

export async function getGymMembers(businessId: string): Promise<GymMember[]> {
  const db = await getDB();
  return db.getAllAsync<GymMember>(
    `SELECT * FROM gym_members WHERE businessId = ? AND (deleted = 0 OR deleted IS NULL)
     ORDER BY name ASC`,
    [businessId]
  );
}

export async function getGymMember(id: string): Promise<GymMember | null> {
  const db = await getDB();
  return db.getFirstAsync<GymMember>('SELECT * FROM gym_members WHERE id = ?', [id]);
}

export async function upsertGymMember(m: GymMember): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO gym_members (
       id, businessId, name, phone, cnic, address, emergencyContact, gender, dateOfBirth,
       joiningDate, planId, planName, planPrice, membershipStart, membershipEnd,
       status, feeStatus, lastFeeDate, heightCm, weightKg, notes, lastUpdated, deleted
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, phone = excluded.phone, cnic = excluded.cnic,
       address = excluded.address, emergencyContact = excluded.emergencyContact,
       gender = excluded.gender, dateOfBirth = excluded.dateOfBirth,
       joiningDate = excluded.joiningDate, planId = excluded.planId,
       planName = excluded.planName, planPrice = excluded.planPrice,
       membershipStart = excluded.membershipStart, membershipEnd = excluded.membershipEnd,
       status = excluded.status, feeStatus = excluded.feeStatus,
       lastFeeDate = excluded.lastFeeDate, heightCm = excluded.heightCm,
       weightKg = excluded.weightKg, notes = excluded.notes,
       lastUpdated = excluded.lastUpdated, deleted = excluded.deleted`,
    [m.id, m.businessId, m.name, m.phone, m.cnic ?? '', m.address ?? '',
     m.emergencyContact ?? '', m.gender ?? 'male', m.dateOfBirth ?? '',
     m.joiningDate, m.planId, m.planName, m.planPrice,
     m.membershipStart, m.membershipEnd, m.status, m.feeStatus,
     m.lastFeeDate ?? '', m.heightCm ?? null, m.weightKg ?? null,
     m.notes ?? '', m.lastUpdated, m.deleted ?? 0]
  );
}

export async function deleteMember(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE gym_members SET deleted = 1, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

export async function refreshMemberFeeStatus(businessId: string): Promise<void> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  // expired membership
  await db.runAsync(
    `UPDATE gym_members SET status = 'expired' WHERE businessId = ? AND membershipEnd < ? AND status = 'active'`,
    [businessId, today]
  );
  // fee overdue: no payment this month
  const thisMonth = today.substring(0, 7);
  const members = await db.getAllAsync<{ id: string; lastFeeDate: string }>(
    `SELECT id, lastFeeDate FROM gym_members WHERE businessId = ? AND status = 'active'`,
    [businessId]
  );
  for (const m of members) {
    const paid = m.lastFeeDate && m.lastFeeDate.startsWith(thisMonth);
    const newStatus = paid ? 'paid' : 'due';
    await db.runAsync('UPDATE gym_members SET feeStatus = ? WHERE id = ?', [newStatus, m.id]);
  }
}

// ─── Payments CRUD ────────────────────────────────────────────────────────────

export async function getGymPayments(businessId: string, memberId?: string): Promise<GymPayment[]> {
  const db = await getDB();
  if (memberId) {
    return db.getAllAsync<GymPayment>(
      'SELECT * FROM gym_payments WHERE businessId = ? AND memberId = ? ORDER BY paidDate DESC',
      [businessId, memberId]
    );
  }
  return db.getAllAsync<GymPayment>(
    'SELECT * FROM gym_payments WHERE businessId = ? ORDER BY paidDate DESC',
    [businessId]
  );
}

export async function recordGymPayment(payment: GymPayment): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO gym_payments (id, businessId, memberId, memberName, planId, planName, amount, month, paidDate, notes, createdBy, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payment.id, payment.businessId, payment.memberId, payment.memberName,
     payment.planId, payment.planName, payment.amount, payment.month,
     payment.paidDate, payment.notes ?? '', payment.createdBy, payment.lastUpdated]
  );
  
  await createNotification(
    payment.businessId,
    'gym_member_paid',
    'Member Paid Fee',
    `${payment.memberName} paid PKR ${payment.amount} for plan ${payment.planName}.`
  );
  // Update member fee status and membership end
  const today = payment.paidDate.split('T')[0];
  const member = await getGymMember(payment.memberId);
  if (member) {
    const plan = await getGymPlanById(member.planId);
    const days = plan?.durationDays ?? 30;
    const start = today;
    const end = new Date(new Date(today).getTime() + days * 86400000).toISOString().split('T')[0];
    await db.runAsync(
      `UPDATE gym_members SET feeStatus = 'paid', lastFeeDate = ?, membershipStart = ?, membershipEnd = ?, status = 'active', lastUpdated = ? WHERE id = ?`,
      [today, start, end, payment.lastUpdated, payment.memberId]
    );
  }
}

async function getGymPlanById(planId: string): Promise<GymPlan | null> {
  const db = await getDB();
  return db.getFirstAsync<GymPlan>('SELECT * FROM gym_plans WHERE id = ?', [planId]);
}

export async function getTodayRevenue(businessId: string): Promise<number> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  const r = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount),0) as total FROM gym_payments WHERE businessId = ? AND paidDate LIKE ?',
    [businessId, `${today}%`]
  );
  return r?.total ?? 0;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export async function getTodayAttendance(businessId: string): Promise<GymAttendance[]> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  return db.getAllAsync<GymAttendance>(
    'SELECT * FROM gym_attendance WHERE businessId = ? AND date = ? ORDER BY checkIn DESC',
    [businessId, today]
  );
}

export async function getAttendanceByMember(businessId: string, memberId: string): Promise<GymAttendance[]> {
  const db = await getDB();
  return db.getAllAsync<GymAttendance>(
    'SELECT * FROM gym_attendance WHERE businessId = ? AND memberId = ? ORDER BY checkIn DESC LIMIT 30',
    [businessId, memberId]
  );
}

export async function checkInMember(businessId: string, member: GymMember, userId: string): Promise<GymAttendance> {
  const db = await getDB();
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  // Check if already checked in today (no checkout yet)
  const existing = await db.getFirstAsync<GymAttendance>(
    'SELECT * FROM gym_attendance WHERE businessId = ? AND memberId = ? AND date = ? AND (checkOut IS NULL OR checkOut = "")',
    [businessId, member.id, today]
  );
  if (existing) return existing;

  const att: GymAttendance = {
    id: 'att_' + Math.random().toString(36).substring(2, 11),
    businessId,
    memberId: member.id,
    memberName: member.name,
    checkIn: now,
    date: today,
  };
  await db.runAsync(
    'INSERT INTO gym_attendance (id, businessId, memberId, memberName, checkIn, date) VALUES (?,?,?,?,?,?)',
    [att.id, att.businessId, att.memberId, att.memberName, att.checkIn, att.date]
  );
  return att;
}

export async function checkOutMember(attendanceId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('UPDATE gym_attendance SET checkOut = ? WHERE id = ?',
    [new Date().toISOString(), attendanceId]);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface GymStats {
  totalMembers: number;
  activeMembers: number;
  dueMembers: number;
  overdueMembers: number;
  expiredMembers: number;
  todayAttendance: number;
  monthlyRevenue: number;
}

export async function getGymStats(businessId: string): Promise<GymStats> {
  const db = await getDB();
  const month = new Date().toISOString().substring(0, 7);
  const today = new Date().toISOString().split('T')[0];

  const [total, active, due, expired, attendance, revenue] = await Promise.all([
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM gym_members WHERE businessId = ? AND (deleted=0 OR deleted IS NULL)',
      [businessId]
    ),
    db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM gym_members WHERE businessId = ? AND status = 'active' AND (deleted=0 OR deleted IS NULL)`,
      [businessId]
    ),
    db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM gym_members WHERE businessId = ? AND feeStatus = 'due' AND status = 'active'`,
      [businessId]
    ),
    db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM gym_members WHERE businessId = ? AND status = 'expired'`,
      [businessId]
    ),
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM gym_attendance WHERE businessId = ? AND date = ?',
      [businessId, today]
    ),
    db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount),0) as total FROM gym_payments WHERE businessId = ? AND month = ?',
      [businessId, month]
    ),
  ]);

  return {
    totalMembers: total?.c ?? 0,
    activeMembers: active?.c ?? 0,
    dueMembers: due?.c ?? 0,
    overdueMembers: 0,
    expiredMembers: expired?.c ?? 0,
    todayAttendance: attendance?.c ?? 0,
    monthlyRevenue: revenue?.total ?? 0,
  };
}

// ─── BMI ─────────────────────────────────────────────────────────────────────

export function calcBMI(heightCm: number, weightKg: number): number {
  if (!heightCm || !weightKg) return 0;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

export function bmiCategory(bmi: number): { label: string; color: string } {
  if (bmi === 0) return { label: 'N/A', color: '#6B7280' };
  if (bmi < 18.5) return { label: 'Underweight', color: '#3B82F6' };
  if (bmi < 25) return { label: 'Normal', color: '#22C55E' };
  if (bmi < 30) return { label: 'Overweight', color: '#F59E0B' };
  return { label: 'Obese', color: '#EF4444' };
}

// ─── Seed default plans ───────────────────────────────────────────────────────

export async function seedDefaultPlans(businessId: string): Promise<void> {
  const existing = await getGymPlans(businessId);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  const defaults: GymPlan[] = [
    { id: `plan_${businessId}_1`, businessId, name: 'Monthly', durationDays: 30, price: 2500, description: '1 month membership', isActive: 1, lastUpdated: now },
    { id: `plan_${businessId}_2`, businessId, name: 'Quarterly', durationDays: 90, price: 6500, description: '3 month membership', isActive: 1, lastUpdated: now },
    { id: `plan_${businessId}_3`, businessId, name: 'Half Yearly', durationDays: 180, price: 11000, description: '6 month membership', isActive: 1, lastUpdated: now },
    { id: `plan_${businessId}_4`, businessId, name: 'Annual', durationDays: 365, price: 18000, description: '12 month membership', isActive: 1, lastUpdated: now },
  ];
  for (const p of defaults) await upsertGymPlan(p);
}
