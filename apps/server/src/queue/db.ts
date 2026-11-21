import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Lead, LeadStatus, PriceResult } from '@jonlix/shared';

export type Sqlite = Database.Database;

export interface LeadRow {
  lead_id: string;
  client_request_id: string;
  created_at: string;
  payload_json: string;
  estimate_json: string;
  working_hours: number;
  urgent: number;
  sheets_status: string;
  sheets_row: number | null;
  sheets_attempts: number;
  tg_status: string;
  tg_message_ids: string | null;
  tg_attempts: number;
  next_attempt_at: string | null;
  lead_status: LeadStatus;
  last_sla_at: string | null;
}

export function openDatabase(file: string): Sqlite {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      lead_id           TEXT PRIMARY KEY,
      client_request_id TEXT UNIQUE NOT NULL,
      created_at        TEXT NOT NULL,
      payload_json      TEXT NOT NULL,
      estimate_json     TEXT NOT NULL,
      working_hours     INTEGER NOT NULL,
      urgent            INTEGER NOT NULL DEFAULT 0,
      sheets_status     TEXT NOT NULL DEFAULT 'pending',
      sheets_row        INTEGER,
      sheets_attempts   INTEGER NOT NULL DEFAULT 0,
      tg_status         TEXT NOT NULL DEFAULT 'pending',
      tg_message_ids    TEXT,
      tg_attempts       INTEGER NOT NULL DEFAULT 0,
      next_attempt_at   TEXT,
      lead_status       TEXT NOT NULL DEFAULT 'new',
      last_sla_at       TEXT
    );
    CREATE TABLE IF NOT EXISTS counters (
      day TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminders (
      lead_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      sent_on TEXT NOT NULL,
      PRIMARY KEY (lead_id, kind, sent_on)
    );
    CREATE INDEX IF NOT EXISTS idx_leads_pending ON leads(sheets_status, tg_status, next_attempt_at);
  `);
  return db;
}

export function insertLead(
  db: Sqlite,
  row: {
    leadId: string;
    clientRequestId: string;
    createdAt: string;
    payload: Lead;
    estimate: PriceResult;
    workingHours: boolean;
    urgent: boolean;
    sheetsStatus?: string;
    tgStatus?: string;
  },
): void {
  db.prepare(
    `INSERT INTO leads (
      lead_id, client_request_id, created_at, payload_json, estimate_json,
      working_hours, urgent, sheets_status, tg_status, next_attempt_at, lead_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
  ).run(
    row.leadId,
    row.clientRequestId,
    row.createdAt,
    JSON.stringify(row.payload),
    JSON.stringify(row.estimate),
    row.workingHours ? 1 : 0,
    row.urgent ? 1 : 0,
    row.sheetsStatus ?? 'pending',
    row.tgStatus ?? 'pending',
    new Date().toISOString(),
  );
}

export function findByClientRequest(db: Sqlite, id: string): LeadRow | undefined {
  return db.prepare('SELECT * FROM leads WHERE client_request_id = ?').get(id) as LeadRow | undefined;
}

export function getLead(db: Sqlite, leadId: string): LeadRow | undefined {
  return db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as LeadRow | undefined;
}

export function listPending(db: Sqlite, nowIso: string): LeadRow[] {
  return db
    .prepare(
      `SELECT * FROM leads
       WHERE (sheets_status = 'pending' OR tg_status = 'pending')
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    )
    .all(nowIso) as LeadRow[];
}

export function saveDelivery(
  db: Sqlite,
  leadId: string,
  patch: Partial<{
    sheets_status: string;
    sheets_row: number | null;
    sheets_attempts: number;
    tg_status: string;
    tg_message_ids: string | null;
    tg_attempts: number;
    next_attempt_at: string | null;
  }>,
): void {
  const current = getLead(db, leadId);
  if (!current) return;
  const next = { ...current, ...patch };
  db.prepare(
    `UPDATE leads SET
      sheets_status = ?, sheets_row = ?, sheets_attempts = ?,
      tg_status = ?, tg_message_ids = ?, tg_attempts = ?, next_attempt_at = ?
     WHERE lead_id = ?`,
  ).run(
    next.sheets_status,
    next.sheets_row,
    next.sheets_attempts,
    next.tg_status,
    next.tg_message_ids,
    next.tg_attempts,
    next.next_attempt_at,
    leadId,
  );
}

export function updateLeadStatus(db: Sqlite, leadId: string, status: LeadStatus): void {
  db.prepare('UPDATE leads SET lead_status = ? WHERE lead_id = ?').run(status, leadId);
}

export function markSla(db: Sqlite, leadId: string, at: string): void {
  db.prepare('UPDATE leads SET last_sla_at = ? WHERE lead_id = ?').run(at, leadId);
}

export function pendingCount(db: Sqlite): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM leads WHERE sheets_status = 'pending' OR tg_status = 'pending'`)
    .get() as { n: number };
  return row.n;
}

export function leadsSince(db: Sqlite, since: Date): LeadRow[] {
  return (db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all() as LeadRow[]).filter(
    (row) => new Date(row.created_at).getTime() >= since.getTime(),
  );
}

export function leadsOnDay(db: Sqlite, day: string): LeadRow[] {
  return db.prepare(`SELECT * FROM leads WHERE created_at LIKE ? ORDER BY created_at DESC`).all(`${day}%`) as LeadRow[];
}

export function newLeads(db: Sqlite): LeadRow[] {
  return db.prepare(`SELECT * FROM leads WHERE lead_status = 'new' ORDER BY created_at ASC`).all() as LeadRow[];
}

export function rememberReminder(db: Sqlite, leadId: string, kind: string, sentOn: string): boolean {
  const result = db
    .prepare('INSERT OR IGNORE INTO reminders(lead_id, kind, sent_on) VALUES (?, ?, ?)')
    .run(leadId, kind, sentOn);
  return result.changes > 0;
}

export function readPayload(row: LeadRow): Lead {
  return JSON.parse(row.payload_json) as Lead;
}

export function readEstimate(row: LeadRow): PriceResult {
  return JSON.parse(row.estimate_json) as PriceResult;
}
