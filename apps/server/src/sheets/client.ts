import { google, type sheets_v4 } from 'googleapis';
import type { AppConfig } from '../config.js';

export function parseCredentials(raw: string): Record<string, unknown> {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

export function createSheets(config: AppConfig): sheets_v4.Sheets {
  const credentials = parseCredentials(config.googleCredentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export function quoteTab(tab: string): string {
  return `'${tab.replaceAll("'", "''")}'`;
}

export function rowNumberFromRange(updatedRange: string | null | undefined): number | null {
  if (!updatedRange) return null;
  const match = /(\d+)(?::[A-Z]+\d+)?$/.exec(updatedRange.replace(/\$/g, ''));
  return match ? Number(match[1]) : null;
}
