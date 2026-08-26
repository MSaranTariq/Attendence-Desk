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
  const timeRaw = get('Time');
  const userRaw = get('User');
  const typeRaw = get('Check-in / Check-out', 'Type', 'Event');
  const category = get('Category') || null;

  if (!timestampRaw || !userRaw || !typeRaw) return null;

  const employee = String(userRaw).split(' (')[0].trim();
  const type = normalizeEventType(typeRaw);
  if (!type) return null;

  const timestamp = parseSheetTimestamp(timestampRaw, timeRaw);
  if (!timestamp || isNaN(timestamp.getTime())) return null;

  return {
    employee,
    type,
    category: category === 'None' ? null : category,
    timestamp,
    raw: row,
  };
}

function normalizeEventType(value) {
  const key = String(value).trim().toLowerCase().replace(/[\s_]+/g, '-');
  const aliases = {
    'check-in': 'check-in',
    'checkin': 'check-in',
    'check-out': 'check-out',
    'checkout': 'check-out',
    'break-start': 'break-start',
    'breakstart': 'break-start',
    'break-end': 'break-end',
    'breakend': 'break-end',
  };
  return aliases[key] || null;
}

/** Handles "MM/DD/YYYY H:mm" as seen in the sheet's Timestamp column, plus native Date/ISO fallbacks. */
function parseSheetTimestamp(value, separateTime) {
  if (value instanceof Date) return value;
  let str = String(value).trim();
  if (separateTime && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    str = `${str} ${String(separateTime).trim()}`;
  }

  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (mdy) {
    const [, monthRaw, dayRaw, yearRaw, hourRaw, minuteRaw, secondRaw, meridiem] = mdy;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const year = Number(yearRaw);
    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw || 0);
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
    }
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
    // Sheet timestamps are local Pakistan time; store the equivalent UTC instant.
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - 5 * 60 * 60 * 1000);
  }

  // Excel serial date number (from XLSX parsing)
  if (typeof value === 'number') {
    return XLSX.SSF ? new Date(Math.round((value - 25569) * 86400 * 1000)) : new Date(value);
  }

  const dateOnly = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dateOnly) {
    const [, monthRaw, dayRaw, yearRaw] = dateOnly;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const year = Number(yearRaw);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
    return new Date(Date.UTC(year, month - 1, day) - 5 * 60 * 60 * 1000);
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
