import { NextResponse } from 'next/server';
import { createAdminSupabase, createServerSupabase } from '../../../lib/supabaseServer';

export async function POST(request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.formData();
  const name = body.get('name');
  const sourceType = body.get('sourceType');
  const sheetUrl = body.get('sheetUrl');
  const dayStart = body.get('dayStart');
  const employeeList = JSON.parse(body.get('employeeList') || '[]');
  if (!name || !['google_sheet', 'file_upload'].includes(sourceType)) {
    return NextResponse.json({ error: 'Project name and source are required' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  let storagePath = null;
  const file = body.get('file');
  if (sourceType === 'file_upload') {
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Please choose a file to upload' }, { status: 400 });
    }
    storagePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await admin.storage
      .from('sheet-uploads')
      .upload(storagePath, file, { upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: project, error } = await admin
    .from('projects')
    .insert({
      user_id: user.id,
      name: name.trim(),
      source_type: sourceType,
      sheet_url: sourceType === 'google_sheet' ? sheetUrl?.trim() || null : null,
      storage_path: sourceType === 'file_upload' ? storagePath : null,
      day_start_time: `${dayStart}:00`,
      employee_list: Array.isArray(employeeList) ? employeeList : [],
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ project });
}
