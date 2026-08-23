import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '../../lib/supabaseServer';
import SignOutButton from '../../components/SignOutButton';

export default async function DashboardPage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (projectsError) throw new Error(`Could not load projects: ${projectsError.message}`);

  return (
    <>
      <header className="app-header">
        <div className="brand"><span className="brand-mark">AD</span> Attendance Desk</div>
        <SignOutButton />
      </header>
      <main className="container">
        <div className="workspace-bar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1 className="page-heading">Your projects</h1>
            <p className="page-subtitle">Monitor attendance sources and keep daily records in one place.</p>
          </div>
          <div className="workspace-actions">
          <Link href="/dashboard/new-project" className="btn">New project</Link>
          </div>
        </div>
        <div className="overview-strip">
          <div className="overview-item"><span className="eyebrow">Projects</span><span className="overview-value">{projects?.length || 0}</span></div>
          <div className="overview-item"><span className="eyebrow">Sources</span><span className="overview-value">{projects?.filter(p => p.source_type === 'google_sheet').length || 0} sheets</span></div>
          <div className="overview-item"><span className="eyebrow">Last activity</span><span className="overview-value">{projects?.some(p => p.last_synced_at) ? 'Synced' : 'Not yet'}</span></div>
        </div>

        <div className="project-list">
        {(!projects || projects.length === 0) && (
          <div className="card" style={{ color: 'var(--muted)' }}>
            No projects yet. Create one and attach a spreadsheet to get started.
          </div>
        )}
        {projects?.map(p => (
          <Link key={p.id} href={`/project/${p.id}`} className="project-item">
            <div>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Day starts at {p.day_start_time?.slice(0, 5)} · {p.source_type === 'google_sheet' ? 'Google Sheet' : 'Uploaded file'}
                {p.last_synced_at ? ` · last synced ${new Date(p.last_synced_at).toLocaleString()}` : ' · never synced'}
              </div>
            </div>
            <span className="badge">Open →</span>
          </Link>
        ))}
        </div>
      </main>
    </>
  );
}
