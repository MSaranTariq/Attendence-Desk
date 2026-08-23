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

  // Pull enough history for a 7-day (or wider) view; adjust the window as needed.
  const since = new Date();
  since.setDate(since.getDate() - 35);

  const { data: events } = await supabase
    .from('attendance_events')
    .select('*')
    .eq('project_id', project.id)
    .gte('event_timestamp', since.toISOString())
    .order('event_timestamp', { ascending: true });

  return <ProjectView project={project} rawEvents={events || []} />;
}
