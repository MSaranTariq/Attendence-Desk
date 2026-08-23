import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Normalizes one parsed row (object with sheet column headers) into an event.
 * Expected columns (case-insensitive, matches your sheet):
 *   Timestamp | User | Check-in / Check-out | Category | Time
 * "User" may be "Full Name (username)" - we strip the username.
 */
function normalizeRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
      if (found && row[found] !== undefined && row[found] !== '') return row[found];
    }
    return undefined;
  };

  const timestampRaw = get('Timestamp');
  const userRaw = get('User');
  const typeRaw = get('Check-in / Check-out', 'Type', 'Event');
  const category = get('Category') || null;

  if (!timestampRaw || !userRaw || !typeRaw) return null;

  const employee = String(userRaw).split(' (')[0].trim();
  const type = String(typeRaw).trim().toLowerCase();
  if (!['check-in', 'check-out', 'break-start', 'break-end'].includes(type)) return null;

  const timestamp = parseSheetTimestamp(timestampRaw);
  if (!timestamp || isNaN(timestamp.getTime())) return null;

  return {
    employee,
    type,
    category: category === 'None' ? null : category,
    timestamp,
    raw: row,
  };
}

/** Handles "DD/MM/YYYY H:mm" as seen in the sheet's Timestamp column, plus native Date/ISO fallbacks. */
function parseSheetTimestamp(value) {
  if (value instanceof Date) return value;
  const str = String(value).trim();

  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmy) {
    const [, d, m, y, hh, mm, ss] = dmy.map(Number);
    return new Date(y, m - 1, d, hh, mm, ss || 0);
  }

  // Excel serial date number (from XLSX parsing)
  if (typeof value === 'number') {
    return XLSX.SSF ? new Date(Math.round((value - 25569) * 86400 * 1000)) : new Date(value);
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Parse a CSV string (e.g. fetched from a published Google Sheet) into normalized events. */
export function parseCSV(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data.map(normalizeRow).filter(Boolean);
}

/** Parse an uploaded .xlsx/.xls/.csv file (ArrayBuffer) into normalized events. */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(normalizeRow).filter(Boolean);
}

/** Build a CSV URL from a standard or published Google Sheets link. */
export function toGoogleSheetCsvUrl(sheetUrl) {
  const url = new URL(sheetUrl.trim());
  const publishedMatch = url.pathname.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  const standardMatch = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gid = url.searchParams.get('gid') || '0';

  if (publishedMatch) {
    return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?output=csv&gid=${gid}`;
  }

  if (!standardMatch) throw new Error('Not a recognizable Google Sheets URL');
  const id = standardMatch[1];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
