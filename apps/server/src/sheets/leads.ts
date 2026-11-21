import type { sheets_v4 } from 'googleapis';
import { quoteTab, rowNumberFromRange } from './client.js';
import { LEAD_HEADERS, leadToRow } from './rows.js';
import type { Lead, PriceResult } from '@jonlix/shared';

export async function appendLead(
  sheets: sheets_v4.Sheets,
  sheetId: string,
  tab: string,
  input: {
    leadId: string;
    createdAt: string;
    workingHours: boolean;
    lead: Lead;
    estimate: PriceResult;
    tgStatus: string;
  },
): Promise<number | null> {
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${quoteTab(tab)}!A:X`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [leadToRow(input)] },
  });
  return rowNumberFromRange(response.data.updates?.updatedRange);
}

export async function updateCell(
  sheets: sheets_v4.Sheets,
  sheetId: string,
  tab: string,
  row: number,
  column: string,
  value: string,
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${quoteTab(tab)}!${column}${row}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  });
}

export { LEAD_HEADERS };
