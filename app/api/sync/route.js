import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '../../../lib/supabaseServer';
import { parseCSV, parseWorkbook, toGoogleSheetCsvUrl } from '../../../lib/parseSheet';
import { getBusinessDay } from '../../../lib/calculateAttendance';

export async function POST(request) {
  const { projectId } = await request.json();
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });

  // Verify the caller owns this project (RLS-scoped client)
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (projectErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  let events = [];
  try {
    if (project.source_type === 'google_sheet') {
      const csvUrl = toGoogleSheetCsvUrl(project.sheet_url);
      const urls = [csvUrl];
      if (csvUrl.includes('/spreadsheets/d/') && !csvUrl.includes('/d/e/')) {
        urls.push(csvUrl.replace(
          /\/export\?format=csv/,
          '/gviz/tq?tqx=out:csv'
        ));
      }

      let lastStatus = null;
      let responseText = '';
      for (const url of urls) {
        const res = await fetch(url, { redirect: 'follow' });
        responseText = await res.text();
        lastStatus = res.status;
        if (res.ok && !responseText.trimStart().startsWith('<!DOCTYPE')) {
          events = parseCSV(responseText);
          break;
        }
      }

      if (events.length === 0 && lastStatus !== 200) {
        const reason = responseText.includes('Sign in')
          ? 'The sheet is private. Share it as "Anyone with the link - Viewer".'
          : `Google returned HTTP ${lastStatus}. Check the sheet link and sharing settings.`;
        throw new Error(reason);
      }
    } else if (project.source_type === 'file_upload') {
      const admin = createAdminSupabase();
      const { data: fileData, error: dlErr } = await admin.storage
        .from('sheet-uploads')
        .download(project.storage_path);
      if (dlErr) throw new Error(`Could not read uploaded file: ${dlErr.message}`);
      const arrayBuffer = await fileData.arrayBuffer();
      events = parseWorkbook(arrayBuffer);
    } else {
      throw new Error('Unknown source_type on project');
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (events.length === 0) {
    return NextResponse.json({ error: 'No valid rows found in the sheet. Check the column headers match Timestamp / User / Check-in / Category / Time.' }, { status: 400 });
  }

  // Sync is authoritative: the sheet is imported in full, then the UI applies date filters.
  const boundary = project.day_start_time.slice(0, 5);
  const eventSummary = events.reduce((summary, event) => {
    summary.types[event.type] = (summary.types[event.type] || 0) + 1;
    const date = getBusinessDay(event.timestamp, boundary);
    summary.dates.add(date);
    return summary;
  }, { types: {}, dates: new Set() });
  const admin = createAdminSupabase();
  const { error: deleteErr } = await admin.from('attendance_events').delete().eq('project_id', projectId);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  const rows = events.map(e => ({
    project_id: projectId,
    employee: e.employee,
    event_type: e.type,
    category: e.category,
    event_timestamp: e.timestamp.toISOString(),
    raw_row: e.raw,
  }));

  const { error: insertErr } = await admin
    .from('attendance_events')
    .upsert(rows, {
      onConflict: 'project_id,employee,event_type,event_timestamp',
      ignoreDuplicates: true,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase
    .from('projects')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', projectId);

  const dates = [...eventSummary.dates].sort();
  return NextResponse.json({
    success: true,
    eventsProcessed: rows.length,
    eventTypes: eventSummary.types,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  });
}
