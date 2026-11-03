import { GoogleAuth, Impersonated } from "google-auth-library";
import { ContestSheet, SheetRow, SUMMARY_HEADER, SUMMARY_ID_COLUMN, SUMMARY_TAB, toTabTitle } from "./buildContestSheet";

// Organizers share their sheet with this address. The API runs as another
// account and borrows this one, which can do nothing but edit shared sheets.
export const SHEETS_SERVICE_ACCOUNT = "swingscore-sheets@swingscore-ab034.iam.gserviceaccount.com";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const MAX_TAB_TITLE = 90;

export class SheetsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface SheetTab {
  id: number;
  title: string;
}

// Everything saving needs from Google, so tests can stand in for it.
export interface SheetsClient {
  getSpreadsheet(spreadsheetId: string): Promise<{ title: string; tabs: SheetTab[] }>;
  addTab(spreadsheetId: string, title: string): Promise<number>;
  clearTab(spreadsheetId: string, title: string): Promise<void>;
  readColumn(spreadsheetId: string, title: string, column: number): Promise<string[]>;
  writeRows(spreadsheetId: string, title: string, startRow: number, rows: SheetRow[]): Promise<void>;
  appendRow(spreadsheetId: string, title: string, row: SheetRow): Promise<void>;
  boldRows(spreadsheetId: string, tabId: number, rows: number[]): Promise<void>;
}

const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;
const columnLetter = (column: number) => String.fromCharCode(65 + column);

function createGoogleClient(): SheetsClient {
  let impersonated: Impersonated | null = null;
  const getToken = async () => {
    impersonated ||= new Impersonated({
      sourceClient: await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient() as any,
      targetPrincipal: SHEETS_SERVICE_ACCOUNT,
      targetScopes: ["https://www.googleapis.com/auth/spreadsheets"],
      lifetime: 3600,
      delegates: []
    });
    const { token } = await impersonated.getAccessToken();
    return token;
  };

  const request = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SHEETS_API}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" }
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new SheetsError(res.status, body.error?.message || `Google Sheets returned ${res.status}`);
    return body;
  };

  const batchUpdate = (spreadsheetId: string, requests: object[]) =>
    request(`${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });

  return {
    async getSpreadsheet(spreadsheetId) {
      const body = await request(`${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`);
      return {
        title: body.properties.title,
        tabs: (body.sheets || []).map((s: any) => ({ id: s.properties.sheetId, title: s.properties.title }))
      };
    },
    async addTab(spreadsheetId, title) {
      const body = await batchUpdate(spreadsheetId, [{ addSheet: { properties: { title } } }]);
      return body.replies[0].addSheet.properties.sheetId;
    },
    async clearTab(spreadsheetId, title) {
      await request(`${spreadsheetId}/values/${encodeURIComponent(quoteTab(title))}:clear`, { method: "POST", body: "{}" });
    },
    async readColumn(spreadsheetId, title, column) {
      const letter = columnLetter(column);
      const range = encodeURIComponent(`${quoteTab(title)}!${letter}:${letter}`);
      const body = await request(`${spreadsheetId}/values/${range}`);
      return (body.values || []).map((row: string[]) => row[0] || "");
    },
    async writeRows(spreadsheetId, title, startRow, rows) {
      const range = encodeURIComponent(`${quoteTab(title)}!A${startRow + 1}`);
      await request(`${spreadsheetId}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: rows }) });
    },
    async appendRow(spreadsheetId, title, row) {
      const range = encodeURIComponent(`${quoteTab(title)}!A1`);
      await request(`${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        body: JSON.stringify({ values: [row] })
      });
    },
    async boldRows(spreadsheetId, tabId, rows) {
      await batchUpdate(spreadsheetId, rows.map((row) => ({
        repeatCell: {
          range: { sheetId: tabId, startRowIndex: row, endRowIndex: row + 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold"
        }
      })));
    }
  };
}

// The real client, unless a test has put a stand-in here.
export const sheetsBackend: { client: SheetsClient | null } = { client: null };
export const getSheetsClient = () => (sheetsBackend.client ||= createGoogleClient());

export function parseSpreadsheetId(url: string): string | null {
  return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || null;
}

// Creates the Summary tab if needed, which also proves we can edit the sheet.
export async function prepareSpreadsheet(client: SheetsClient, spreadsheetId: string) {
  const { title, tabs } = await client.getSpreadsheet(spreadsheetId);
  if (!tabs.some((tab) => tab.title === SUMMARY_TAB)) {
    const tabId = await client.addTab(spreadsheetId, SUMMARY_TAB);
    await client.writeRows(spreadsheetId, SUMMARY_TAB, 0, [SUMMARY_HEADER]);
    await client.boldRows(spreadsheetId, tabId, [0]);
  }
  return { title };
}

function getUniqueTitle(name: string, tabs: SheetTab[]) {
  const base = toTabTitle(name, MAX_TAB_TITLE);
  const taken = new Set(tabs.map((tab) => tab.title));
  if (!taken.has(base)) return base;
  let number = 2;
  while (taken.has(`${base} (${number})`)) number++;
  return `${base} (${number})`;
}

// Saves a contest, replacing its own tab and Summary row if it was saved before.
// A later event can reuse a contest's name, so its tab is tracked by id, not name.
export async function saveContestSheet(client: SheetsClient, spreadsheetId: string, sheet: ContestSheet, previousTabId?: number) {
  await prepareSpreadsheet(client, spreadsheetId);
  const { tabs } = await client.getSpreadsheet(spreadsheetId);

  const existing = tabs.find((tab) => tab.id === previousTabId);
  const title = existing ? existing.title : getUniqueTitle(sheet.title, tabs);
  const tabId = existing ? existing.id : await client.addTab(spreadsheetId, title);
  if (existing) await client.clearTab(spreadsheetId, title);
  await client.writeRows(spreadsheetId, title, 0, sheet.rows);
  await client.boldRows(spreadsheetId, tabId, sheet.headerRows);

  const ids = await client.readColumn(spreadsheetId, SUMMARY_TAB, SUMMARY_ID_COLUMN);
  const row = ids.indexOf(sheet.heatId);
  if (row === -1) {
    await client.appendRow(spreadsheetId, SUMMARY_TAB, sheet.summaryRow);
  } else {
    await client.writeRows(spreadsheetId, SUMMARY_TAB, row, [sheet.summaryRow]);
  }
  return tabId;
}
