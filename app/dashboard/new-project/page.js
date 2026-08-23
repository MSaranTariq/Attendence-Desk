'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';

export default function NewProjectPage() {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('google_sheet');
  const [sheetUrl, setSheetUrl] = useState('');
  const [file, setFile] = useState(null);
  const [dayStart, setDayStart] = useState('06:00');
  const [employeesText, setEmployeesText] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);

  async function extractEmployees() {
    setExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      if (sourceType === 'google_sheet') formData.append('sheetUrl', sheetUrl);
      if (sourceType === 'file_upload' && file) formData.append('file', file);
      const response = await fetch('/api/sheet-preview', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not extract employee names');
      setEmployeesText(result.names.join('\n'));
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const employee_list = employeesText.split('\n').map(s => s.trim()).filter(Boolean);

      const formData = new FormData();
      formData.append('name', name);
      formData.append('sourceType', sourceType);
      formData.append('sheetUrl', sheetUrl);
      formData.append('dayStart', dayStart);
      formData.append('employeeList', JSON.stringify(employee_list));
      if (file) formData.append('file', file);

      const response = await fetch('/api/projects', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create project');

      router.push(`/project/${result.project.id}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22 }}>New project</h1>
      <form onSubmit={handleSubmit} className="card">
        <div className="field">
          <label>Project name</label>
          <input className="input" required value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office Attendance" />
        </div>

        <div className="field">
          <label>Spreadsheet source</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button"
              className={`btn ${sourceType === 'google_sheet' ? '' : 'btn-secondary'}`}
              onClick={() => setSourceType('google_sheet')}>Google Sheet</button>
            <button type="button"
              className={`btn ${sourceType === 'file_upload' ? '' : 'btn-secondary'}`}
              onClick={() => setSourceType('file_upload')}>Upload file</button>
          </div>
        </div>

        {sourceType === 'google_sheet' ? (
          <div className="field">
            <label>Google Sheet link (share as "Anyone with the link — Viewer")</label>
            <input className="input" required type="url" value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..." />
          </div>
        ) : (
          <div className="field">
            <label>Upload .xlsx / .csv</label>
            <input className="input" required type="file" accept=".csv,.xlsx,.xls"
              onChange={e => setFile(e.target.files[0])} />
          </div>
        )}

        <div className="field">
          <label>Daily calculation boundary — the time each "day" starts</label>
          <input className="input" type="time" value={dayStart}
            onChange={e => setDayStart(e.target.value)} style={{ maxWidth: 160 }} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            e.g. 06:00 means each day's hours run from 6:00 AM until 6:00 AM the next day.
          </div>
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-end' }}>
            <label style={{ marginBottom: 0 }}>People and display order</label>
            <button type="button" className="btn-secondary btn" onClick={extractEmployees}
              disabled={extracting || (sourceType === 'google_sheet' ? !sheetUrl.trim() : !file)}>
                {extracting ? 'Extracting…' : sourceType === 'google_sheet' ? 'Extract names from sheet' : 'Extract names from file'}
            </button>
          </div>
          <textarea className="input" rows={10} value={employeesText}
            onChange={e => setEmployeesText(e.target.value)}
            placeholder="Add one person per line, or extract names from your Google Sheet."
            style={{ marginTop: 8, resize: 'vertical' }} />
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
            Names are kept in this order in the attendance table. You can edit the list before creating the project.
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={loading} type="submit">
          {loading ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </div>
  );
}
