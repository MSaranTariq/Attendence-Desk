import { NextResponse } from 'next/server';
import { createServerSupabase } from '../../../lib/supabaseServer';
import { parseCSV, parseWorkbook, toGoogleSheetCsvUrl } from '../../../lib/parseSheet';

async function fetchSheetCsv(sheetUrl) {
  const csvUrl = toGoogleSheetCsvUrl(sheetUrl);
  const urls = [csvUrl];
  if (csvUrl.includes('/spreadsheets/d/') && !csvUrl.includes('/d/e/')) {
    urls.push(csvUrl.replace('/export?format=csv', '/gviz/tq?tqx=out:csv'));
  }

  for (const url of urls) {
    const response = await fetch(url, { redirect: 'follow' });
    const text = await response.text();
    if (response.ok && !text.trimStart().startsWith('<!DOCTYPE')) return text;
  }

  throw new Error('Could not access the sheet. Share it as "Anyone with the link - Viewer" and check the URL.');
}

export async function POST(request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const body = await request.formData();
    const sheetUrl = body.get('sheetUrl');
    const file = body.get('file');
    let events;

    if (file && typeof file.arrayBuffer === 'function') {
      events = parseWorkbook(await file.arrayBuffer());
    } else if (sheetUrl) {
      events = parseCSV(await fetchSheetCsv(sheetUrl));
    } else {
      return NextResponse.json({ error: 'Choose a file or enter a Google Sheet URL' }, { status: 400 });
    }

    const names = [...new Set(events.map(event => event.employee))];
    if (names.length === 0) {
      return NextResponse.json({ error: 'No employee names found. Check that the sheet has valid Timestamp, User, and event columns.' }, { status: 400 });
    }

    return NextResponse.json({ names });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
