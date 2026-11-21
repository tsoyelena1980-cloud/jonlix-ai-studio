import { loadConfig } from '../config.js';
import { createSheets } from './client.js';
import { LEAD_HEADERS, PORTFOLIO_HEADERS, STATUS_OPTIONS } from './rows.js';

const config = loadConfig();
if (!config.sheetsEnabled) {
  throw new Error('Нужны SHEET_ID и GOOGLE_SERVICE_ACCOUNT_JSON');
}

const sheets = createSheets(config);

async function ensureSheet(title: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.sheetId });
  const found = meta.data.sheets?.find((sheet) => sheet.properties?.title === title);
  if (found?.properties?.sheetId != null) return found.properties.sheetId;
  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.sheetId,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  const id = created.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (id == null) throw new Error(`Не удалось создать лист ${title}`);
  return id;
}

async function writeHeaders(tab: string, headers: string[]): Promise<void> {
  const end = String.fromCharCode('A'.charCodeAt(0) + headers.length - 1);
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.sheetId,
    range: `'${tab}'!A1:${end}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });
}

const leadsId = await ensureSheet(config.sheetLeadsTab);
const portfolioId = await ensureSheet(config.sheetPortfolioTab);
await writeHeaders(config.sheetLeadsTab, LEAD_HEADERS);
await writeHeaders(config.sheetPortfolioTab, PORTFOLIO_HEADERS);

await sheets.spreadsheets.batchUpdate({
  spreadsheetId: config.sheetId,
  requestBody: {
    requests: [
      {
        updateSheetProperties: {
          properties: { sheetId: leadsId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId: portfolioId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      {
        setDataValidation: {
          range: { sheetId: leadsId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: 22, endColumnIndex: 23 },
          rule: {
            condition: { type: 'ONE_OF_LIST', values: STATUS_OPTIONS.map((value) => ({ userEnteredValue: value })) },
            showCustomUi: true,
            strict: false,
          },
        },
      },
      {
        setDataValidation: {
          range: { sheetId: portfolioId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 1 },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: ['photo', 'animation', 'video', 'business'].map((value) => ({ userEnteredValue: value })),
            },
            showCustomUi: true,
            strict: false,
          },
        },
      },
      {
        setDataValidation: {
          range: { sheetId: portfolioId, startRowIndex: 1, endRowIndex: 500, startColumnIndex: 7, endColumnIndex: 8 },
          rule: {
            condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'да' }, { userEnteredValue: 'нет' }] },
            showCustomUi: true,
            strict: false,
          },
        },
      },
    ],
  },
});

console.log('Таблица готова: листы «Заявки» и «Портфолио», заголовки и списки.');
