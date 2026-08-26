import { redirect, notFound } from 'next/navigation';
import { createServerSupabase } from '../../../lib/supabaseServer';
import ProjectView from '../../../components/ProjectView';

export default async function ProjectPage({ params }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!project) notFound();

  const pageSize = 1000;
  const events = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data: page, error } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('project_id', project.id)
      .order('event_timestamp', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Could not load attendance events: ${error.message}`);
    events.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }

  return <ProjectView project={project} rawEvents={events} />;
}
