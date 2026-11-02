import ExcelJS from "exceljs";
import type { AppState } from "../../src/types";
import { buildContestSheet, SUMMARY_HEADER, SUMMARY_ID_COLUMN, SUMMARY_TAB, toTabTitle } from "./buildContestSheet";

const MAX_EXCEL_TITLE = 31;

function getUniqueTitle(name: string, taken: Set<string>) {
  const base = toTabTitle(name, MAX_EXCEL_TITLE - 4);
  let title = base;
  for (let number = 2; taken.has(title.toLowerCase()); number++) title = `${base} (${number})`;
  taken.add(title.toLowerCase());
  return title;
}

const boldRow = (worksheet: ExcelJS.Worksheet, row: number) => {
  worksheet.getRow(row + 1).font = { bold: true };
};

// The same workbook as the Google Sheet: a Summary, then a tab per published contest.
export async function buildWorkbook(state: AppState) {
  const workbook = new ExcelJS.Workbook();
  const summary = workbook.addWorksheet(SUMMARY_TAB);
  summary.addRow(SUMMARY_HEADER.slice(0, SUMMARY_ID_COLUMN));
  boldRow(summary, 0);

  const published = new Set(state.settings.publishedHeatIds || []);
  const taken = new Set([SUMMARY_TAB.toLowerCase()]);
  (state.settings.completedResults || [])
    .filter((contest) => published.has(contest.heatId))
    .forEach((contest) => {
      const heat = state.heats.find((h) => h.id === contest.heatId);
      if (!heat) return;
      const sheet = buildContestSheet(contest, heat, state);
      summary.addRow(sheet.summaryRow.slice(0, SUMMARY_ID_COLUMN));
      const worksheet = workbook.addWorksheet(getUniqueTitle(sheet.title, taken));
      sheet.rows.forEach((row) => worksheet.addRow(row));
      sheet.headerRows.forEach((row) => boldRow(worksheet, row));
    });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
