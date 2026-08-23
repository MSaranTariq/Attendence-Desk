import { NextResponse } from 'next/server';
import { createAdminSupabase, createServerSupabase } from '../../../../lib/supabaseServer';

export async function PATCH(request, { params }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.formData();
  const sourceType = body.get('sourceType');
  const sheetUrl = body.get('sheetUrl');
  const file = body.get('file');
  if (!['google_sheet', 'file_upload'].includes(sourceType)) {
    return NextResponse.json({ error: 'Choose a valid source type' }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, storage_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();
  if (projectError || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const admin = createAdminSupabase();
  let storagePath = null;
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

  const { error } = await admin
    .from('projects')
    .update({
      source_type: sourceType,
      sheet_url: sourceType === 'google_sheet' ? sheetUrl?.trim() || null : null,
      storage_path: storagePath,
    })
    .eq('id', project.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (project.storage_path && project.storage_path !== storagePath) {
    await admin.storage.from('sheet-uploads').remove([project.storage_path]);
  }

  return NextResponse.json({ success: true });
}
