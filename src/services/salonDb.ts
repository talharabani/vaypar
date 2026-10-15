/**
 * Salon Database Service
 *
 * SQLite schema and CRUD operations for the Salon / Beauty module.
 * Manages services, appointments, and scheduling.
 */

import { getDB } from './sqlite';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SalonService {
  id: string;
  businessId: string;
  name: string;
  category: string; // Hair, Makeup, Spa, Bridal, Nails, Skincare
  price: number;
  durationMinutes: number;
  description: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export interface SalonAppointment {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime: string; // HH:MM
  durationMinutes: number;
  price: number;
  status: AppointmentStatus;
  notes: string;
  synced?: number;
  lastUpdated: string;
  deleted?: number;
}

export interface SalonStats {
  todayAppointments: number;
  upcomingAppointments: number;
  completedToday: number;
  totalServices: number;
  todayRevenue: number;
}

export const SERVICE_CATEGORIES = [
  'Hair',
  'Makeup',
  'Spa',
  'Bridal',
  'Nails',
  'Skincare',
  'Waxing',
  'Threading',
  'Facial',
  'Other',
] as const;

// ─── Schema Initialization ───────────────────────────────────────────────────

export async function initSalonTables(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS salon_services (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      price REAL DEFAULT 0,
      durationMinutes INTEGER DEFAULT 30,
      description TEXT DEFAULT '',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS salon_appointments (
      id TEXT PRIMARY KEY,
      businessId TEXT NOT NULL,
      customerName TEXT NOT NULL,
      customerPhone TEXT DEFAULT '',
      serviceId TEXT DEFAULT '',
      serviceName TEXT DEFAULT '',
      staffId TEXT DEFAULT '',
      staffName TEXT DEFAULT '',
      appointmentDate TEXT NOT NULL,
      appointmentTime TEXT NOT NULL,
      durationMinutes INTEGER DEFAULT 30,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'scheduled',
      notes TEXT DEFAULT '',
      synced INTEGER DEFAULT 0,
      lastUpdated TEXT,
      deleted INTEGER DEFAULT 0
    );
  `);
}

// ─── Service CRUD ────────────────────────────────────────────────────────────

export async function getServices(businessId: string): Promise<SalonService[]> {
  const db = await getDB();
  return db.getAllAsync<SalonService>(
    'SELECT * FROM salon_services WHERE businessId = ? AND deleted = 0 ORDER BY category, name',
    [businessId]
  );
}

export async function getServiceById(id: string): Promise<SalonService | null> {
  const db = await getDB();
  return db.getFirstAsync<SalonService>(
    'SELECT * FROM salon_services WHERE id = ?',
    [id]
  );
}

export async function upsertService(service: SalonService): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO salon_services (id, businessId, name, category, price, durationMinutes, description, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       category = excluded.category,
       price = excluded.price,
       durationMinutes = excluded.durationMinutes,
       description = excluded.description,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      service.id, service.businessId, service.name, service.category,
      service.price, service.durationMinutes, service.description,
      service.synced ?? 0, service.lastUpdated, service.deleted ?? 0,
    ]
  );
}

export async function deleteService(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE salon_services SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── Appointment CRUD ────────────────────────────────────────────────────────

export async function getAppointments(businessId: string, date?: string): Promise<SalonAppointment[]> {
  const db = await getDB();
  if (date) {
    return db.getAllAsync<SalonAppointment>(
      'SELECT * FROM salon_appointments WHERE businessId = ? AND appointmentDate = ? AND deleted = 0 ORDER BY appointmentTime',
      [businessId, date]
    );
  }
  return db.getAllAsync<SalonAppointment>(
    'SELECT * FROM salon_appointments WHERE businessId = ? AND deleted = 0 ORDER BY appointmentDate DESC, appointmentTime',
    [businessId]
  );
}

export async function getAppointmentById(id: string): Promise<SalonAppointment | null> {
  const db = await getDB();
  return db.getFirstAsync<SalonAppointment>(
    'SELECT * FROM salon_appointments WHERE id = ?',
    [id]
  );
}

export async function getUpcomingAppointments(businessId: string, limit = 20): Promise<SalonAppointment[]> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];
  return db.getAllAsync<SalonAppointment>(
    `SELECT * FROM salon_appointments 
     WHERE businessId = ? AND appointmentDate >= ? AND deleted = 0 AND status IN ('scheduled', 'in_progress')
     ORDER BY appointmentDate, appointmentTime
     LIMIT ?`,
    [businessId, today, limit]
  );
}

export async function upsertAppointment(appointment: SalonAppointment): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO salon_appointments (id, businessId, customerName, customerPhone, serviceId, serviceName, staffId, staffName, appointmentDate, appointmentTime, durationMinutes, price, status, notes, synced, lastUpdated, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       customerName = excluded.customerName,
       customerPhone = excluded.customerPhone,
       serviceId = excluded.serviceId,
       serviceName = excluded.serviceName,
       staffId = excluded.staffId,
       staffName = excluded.staffName,
       appointmentDate = excluded.appointmentDate,
       appointmentTime = excluded.appointmentTime,
       durationMinutes = excluded.durationMinutes,
       price = excluded.price,
       status = excluded.status,
       notes = excluded.notes,
       synced = excluded.synced,
       lastUpdated = excluded.lastUpdated,
       deleted = excluded.deleted`,
    [
      appointment.id, appointment.businessId, appointment.customerName,
      appointment.customerPhone, appointment.serviceId, appointment.serviceName,
      appointment.staffId, appointment.staffName, appointment.appointmentDate,
      appointment.appointmentTime, appointment.durationMinutes, appointment.price,
      appointment.status, appointment.notes, appointment.synced ?? 0,
      appointment.lastUpdated, appointment.deleted ?? 0,
    ]
  );
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE salon_appointments SET status = ?, synced = 0, lastUpdated = ? WHERE id = ?',
    [status, new Date().toISOString(), id]
  );
}

export async function deleteAppointment(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'UPDATE salon_appointments SET deleted = 1, synced = 0, lastUpdated = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// ─── Statistics ──────────────────────────────────────────────────────────────

export async function getSalonStats(businessId: string): Promise<SalonStats> {
  const db = await getDB();
  const today = new Date().toISOString().split('T')[0];

  const todayCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM salon_appointments WHERE businessId = ? AND appointmentDate = ? AND deleted = 0",
    [businessId, today]
  );

  const upcomingCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM salon_appointments WHERE businessId = ? AND appointmentDate >= ? AND deleted = 0 AND status IN ('scheduled', 'in_progress')",
    [businessId, today]
  );

  const completedCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM salon_appointments WHERE businessId = ? AND appointmentDate = ? AND status = 'completed' AND deleted = 0",
    [businessId, today]
  );

  const servicesCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM salon_services WHERE businessId = ? AND deleted = 0",
    [businessId]
  );

  const revenue = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(price) as total FROM salon_appointments WHERE businessId = ? AND appointmentDate = ? AND status = 'completed' AND deleted = 0",
    [businessId, today]
  );

  return {
    todayAppointments: todayCount?.count ?? 0,
    upcomingAppointments: upcomingCount?.count ?? 0,
    completedToday: completedCount?.count ?? 0,
    totalServices: servicesCount?.count ?? 0,
    todayRevenue: revenue?.total ?? 0,
  };
}

// ─── Seed Default Services ───────────────────────────────────────────────────

export async function seedDefaultServices(businessId: string): Promise<void> {
  const now = new Date().toISOString();
  const defaults: Omit<SalonService, 'synced' | 'lastUpdated' | 'deleted'>[] = [
    { id: `svc_${businessId}_1`, businessId, name: 'Haircut (Men)', category: 'Hair', price: 500, durationMinutes: 30, description: 'Standard men haircut' },
    { id: `svc_${businessId}_2`, businessId, name: 'Haircut (Women)', category: 'Hair', price: 1500, durationMinutes: 45, description: 'Women haircut with blow dry' },
    { id: `svc_${businessId}_3`, businessId, name: 'Hair Color', category: 'Hair', price: 3000, durationMinutes: 90, description: 'Full head color treatment' },
    { id: `svc_${businessId}_4`, businessId, name: 'Facial', category: 'Facial', price: 2000, durationMinutes: 60, description: 'Deep cleansing facial' },
    { id: `svc_${businessId}_5`, businessId, name: 'Bridal Makeup', category: 'Bridal', price: 15000, durationMinutes: 120, description: 'Complete bridal makeup package' },
    { id: `svc_${businessId}_6`, businessId, name: 'Manicure', category: 'Nails', price: 800, durationMinutes: 30, description: 'Nail shaping, cuticle care, polish' },
    { id: `svc_${businessId}_7`, businessId, name: 'Pedicure', category: 'Nails', price: 1000, durationMinutes: 45, description: 'Foot soak, scrub, nail polish' },
    { id: `svc_${businessId}_8`, businessId, name: 'Full Body Wax', category: 'Waxing', price: 4000, durationMinutes: 90, description: 'Full body waxing treatment' },
  ];

  for (const svc of defaults) {
    await upsertService({
      ...svc,
      synced: 0,
      lastUpdated: now,
      deleted: 0,
    });
  }
}
