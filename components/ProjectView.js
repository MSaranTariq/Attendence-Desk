'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import { calculateAttendance } from '../lib/calculateAttendance';
import { buildAttendanceSheetRows } from '../lib/attendanceExport';
import AttendanceTable from './AttendanceTable';

function toDateKey(d) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function ProjectView({ project, rawEvents }) {
  const supabase = createClient();
  const router = useRouter();

  const [dayStart, setDayStart] = useState(project.day_start_time.slice(0, 5));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(project.sheet_url || '');
  const [sourceType, setSourceType] = useState(project.source_type);
  const [sourceFile, setSourceFile] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('attendance');
  const [employeeList, setEmployeeList] = useState(project.employee_list || []);
  const [newEmployee, setNewEmployee] = useState('');
  const [exportRange, setExportRange] = useState('current');
  const [exportMsg, setExportMsg] = useState(null);
  const [extracting, setExtracting] = useState(false);

  // Default filter: expand to the complete range currently loaded.
  const todayKey = toDateKey(new Date());
  const monthStartKey = `${todayKey.slice(0, 8)}01`;
  const sevenDaysAgoKey = toDateKey(new Date(Date.now() - 7 * 86400000));
  const thirtyDaysAgoKey = toDateKey(new Date(Date.now() - 30 * 86400000));
  const [fromDate, setFromDate] = useState(monthStartKey);
  const [toDateVal, setToDateVal] = useState(todayKey);
  const [exportFromDate, setExportFromDate] = useState(monthStartKey);
  const [exportToDate, setExportToDate] = useState(todayKey);

  const events = useMemo(() => rawEvents.map(e => ({
    employee: e.employee,
    type: e.event_type,
    timestamp: new Date(e.event_timestamp),
  })), [rawEvents]);

  const allRows = useMemo(
    () => calculateAttendance(events, dayStart, employeeList),
    [events, dayStart, employeeList]
  );

  const filteredRows = useMemo(
    () => allRows.filter(r => r.date >= fromDate && r.date <= toDateVal),
    [allRows, fromDate, toDateVal]
  );

  const rowsToExport = exportRange === 'all'
    ? allRows
    : exportRange === 'custom'
      ? allRows.filter(row => row.date >= exportFromDate && row.date <= exportToDate)
      : filteredRows;

  useEffect(() => {
    const syncedDates = allRows.map(row => row.date).sort();
    if (syncedDates.length === 0) return;
    setFromDate(syncedDates[0]);
    setToDateVal(syncedDates[syncedDates.length - 1]);
    setExportFromDate(syncedDates[0]);
    setExportToDate(syncedDates[syncedDates.length - 1]);
  }, [allRows]);

  function showAllHistoricalDays() {
    const earliestDate = allRows.reduce(
      (earliest, row) => row.date < earliest ? row.date : earliest,
      todayKey
    );
    setFromDate(earliestDate);
    setToDateVal(todayKey);
  }

  function exportToCsv() {
    setExportMsg(null);
    const { values } = buildAttendanceSheetRows(rowsToExport, employeeList);
    const csvCell = value => {
      const text = value == null ? '' : String(value);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = values.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'attendance'}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMsg(`Exported ${new Set(rowsToExport.map(row => row.date)).size} day(s) to CSV.`);
  }

  async function handleRemoveSheetUrl() {
    setSheetUrl('');
    setSavingSettings(true);
    setSettingsMsg(null);
    const { error } = await supabase
      .from('projects')
      .update({ sheet_url: null })
      .eq('id', project.id);
    setSettingsMsg(error ? `Error: ${error.message}` : 'Sheet link removed.');
    setSavingSettings(false);
    if (!error) router.refresh();
  }

  async function handleSaveSource() {
    setSavingSettings(true);
    setSettingsMsg(null);
    const formData = new FormData();
    formData.append('sourceType', sourceType);
    formData.append('sheetUrl', sheetUrl);
    if (sourceFile) formData.append('file', sourceFile);
    const response = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', body: formData });
    const result = await response.json();
    setSettingsMsg(response.ok ? 'Project source saved.' : `Error: ${result.error || 'Could not save source'}`);
    setSavingSettings(false);
    if (response.ok) {
      setSourceFile(null);
      router.refresh();
    }
  }

  async function extractEmployeesFromSource() {
    setExtracting(true);
    setSettingsMsg(null);
    try {
      const formData = new FormData();
      if (sourceType === 'google_sheet') formData.append('sheetUrl', sheetUrl);
      if (sourceType === 'file_upload' && sourceFile) formData.append('file', sourceFile);
      const response = await fetch('/api/sheet-preview', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not extract employee names');
      setEmployeeList(result.names);
      setSettingsMsg('Employee names extracted. Save people order to apply them.');
    } catch (err) {
      setSettingsMsg(`Error: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSaveEmployees() {
    setSavingSettings(true);
    setSettingsMsg(null);
    const cleanedEmployees = employeeList.map(name => name.trim()).filter(Boolean);
    const { error } = await supabase
      .from('projects')
      .update({ employee_list: cleanedEmployees })
      .eq('id', project.id);
    setSettingsMsg(error ? `Error: ${error.message}` : 'Employee order saved.');
    setSavingSettings(false);
    if (!error) {
      setEmployeeList(cleanedEmployees);
      router.refresh();
    }
  }

  function addEmployee(e) {
    e.preventDefault();
    const name = newEmployee.trim();
    if (!name) return;
    setEmployeeList(current => [...current, name]);
    setNewEmployee('');
  }

  function moveEmployee(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= employeeList.length) return;
    setEmployeeList(current => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function handleDeleteProject() {
    if (!window.confirm(`Delete "${project.name}" and all synced attendance records?`)) return;
    setDeleting(true);
    setSettingsMsg(null);
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) {
      setSettingsMsg(`Error: ${error.message}`);
      setDeleting(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      const range = data.dateRange ? ` (${data.dateRange.from} to ${data.dateRange.to})` : '';
      const checkouts = data.eventTypes?.['check-out'] || 0;
      setSyncMsg(`Synced ${data.eventsProcessed} events${range}. Check-outs imported: ${checkouts}.`);
      if (data.dateRange) {
        setFromDate(data.dateRange.from);
        setToDateVal(data.dateRange.to);
        setExportFromDate(data.dateRange.from);
        setExportToDate(data.dateRange.to);
      }
      router.refresh();
    } catch (err) {
      setSyncMsg(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveDayStart() {
    setSavingSettings(true);
    await supabase.from('projects').update({ day_start_time: `${dayStart}:00` }).eq('id', project.id);
    setSavingSettings(false);
    router.refresh();
  }

  return (
    <>
      <header className="app-header">
        <Link href="/dashboard" className="brand"><span className="brand-mark">AD</span> Attendance Desk</Link>
      </header>
      <main className="container">
      <div className="workspace-bar">
        <div>
          <Link href="/dashboard" style={{ fontSize: 13 }}>&larr; Projects</Link>
          <p className="eyebrow" style={{ marginTop: 14 }}>Project workspace</p>
          <h1 className="page-heading">{project.name}</h1>
          <p className="page-subtitle">Attendance records, sync status, and project controls.</p>
        </div>
        <div className="workspace-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="input" value={exportRange} onChange={e => setExportRange(e.target.value)}
              aria-label="Export range" style={{ width: 170 }}>
              <option value="current">Current date filter</option>
              <option value="all">All available days</option>
              <option value="custom">Custom date range</option>
            </select>
            <button className="btn-secondary btn" onClick={exportToCsv}
              disabled={rowsToExport.length === 0
                || (exportRange === 'custom' && exportFromDate > exportToDate)}>
              Export to CSV
            </button>
          </div>
          {exportRange === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ margin: 0 }}>Export from</label>
              <input className="input" type="date" value={exportFromDate}
                onChange={e => setExportFromDate(e.target.value)} style={{ width: 160 }} />
              <label style={{ margin: 0 }}>to</label>
              <input className="input" type="date" value={exportToDate}
                onChange={e => setExportToDate(e.target.value)} style={{ width: 160 }} />
            </div>
          )}
          <button className="btn" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={activeTab === 'attendance' ? 'btn' : 'btn-secondary btn'} onClick={() => setActiveTab('attendance')}
          aria-pressed={activeTab === 'attendance'}>
          Attendance
        </button>
        <button className={activeTab === 'settings' ? 'btn' : 'btn-secondary btn'} onClick={() => setActiveTab('settings')}
          aria-pressed={activeTab === 'settings'}>
          Settings
        </button>
      </div>

      {activeTab === 'attendance' && (syncMsg || exportMsg) && (
        <div className="card" style={{ marginBottom: 16, fontSize: 14 }}>
          {syncMsg && <p style={{ margin: exportMsg ? '0 0 8px' : 0 }}>{syncMsg}</p>}
          {exportMsg && <p style={{ margin: 0 }}>{exportMsg}</p>}
        </div>
      )}

      {activeTab === 'attendance' && <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Daily boundary time</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="time" value={dayStart}
                onChange={e => setDayStart(e.target.value)} style={{ width: 140 }} />
              <button className="btn-secondary btn" onClick={handleSaveDayStart} disabled={savingSettings}>
                {savingSettings ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <div>
            <label>From</label>
            <input className="input" type="date" value={fromDate}
              onChange={e => setFromDate(e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <label>To</label>
            <input className="input" type="date" value={toDateVal}
              onChange={e => setToDateVal(e.target.value)} style={{ width: 160 }} />
          </div>
          <div>
            <button className="btn-secondary btn" onClick={() => { setFromDate(sevenDaysAgoKey); setToDateVal(todayKey); }}>
              Last 7 days
            </button>
          </div>
          <div>
            <button className="btn-secondary btn" onClick={() => { setFromDate(thirtyDaysAgoKey); setToDateVal(todayKey); }}>
              Last 30 days
            </button>
          </div>
          <div>
            <button className="btn-secondary btn" onClick={showAllHistoricalDays}>
              All available
            </button>
          </div>
        </div>
      </div>
      }

      {activeTab === 'settings' && <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Project settings</h2>
        <div className="field">
          <label>Attendance source</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className={sourceType === 'google_sheet' ? 'btn' : 'btn-secondary btn'}
              onClick={() => setSourceType('google_sheet')}>Google Sheet</button>
            <button type="button" className={sourceType === 'file_upload' ? 'btn' : 'btn-secondary btn'}
              onClick={() => setSourceType('file_upload')}>Upload file</button>
          </div>
          {sourceType === 'google_sheet' ? (
            <label>Google Sheet link</label>
          ) : (
            <label>Replace uploaded file</label>
          )}
          {sourceType === 'google_sheet' ? (
            <input className="input" type="url" value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..." />
          ) : (
            <input className="input" type="file" accept=".csv,.xlsx,.xls"
              onChange={e => setSourceFile(e.target.files[0] || null)} />
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={handleSaveSource}
              disabled={savingSettings || (sourceType === 'google_sheet' ? !sheetUrl.trim() : !sourceFile)}>
              {savingSettings ? 'Saving…' : 'Save source'}
            </button>
            {sourceType === 'google_sheet' && (
              <button className="btn-secondary btn" onClick={handleRemoveSheetUrl} disabled={savingSettings || !sheetUrl}>
                Remove link
              </button>
            )}
            <button className="btn-secondary btn" onClick={extractEmployeesFromSource}
              disabled={extracting || (sourceType === 'google_sheet' ? !sheetUrl.trim() : !sourceFile)}>
              {extracting ? 'Extracting…' : sourceType === 'google_sheet' ? 'Extract from sheet' : 'Extract from file'}
            </button>
          </div>
        </div>
        <div className="field">
          <label>People and display order</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {employeeList.map((employee, index) => (
              <div key={`${index}-${employee}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="input" value={employee}
                  onChange={e => setEmployeeList(current => current.map((name, i) => i === index ? e.target.value : name))} />
                <button type="button" className="btn-secondary btn" onClick={() => moveEmployee(index, -1)}
                  disabled={index === 0} aria-label={`Move ${employee} up`}>↑</button>
                <button type="button" className="btn-secondary btn" onClick={() => moveEmployee(index, 1)}
                  disabled={index === employeeList.length - 1} aria-label={`Move ${employee} down`}>↓</button>
                <button type="button" className="btn-secondary btn" onClick={() => setEmployeeList(current => current.filter((_, i) => i !== index))}
                  aria-label={`Remove ${employee}`}>Remove</button>
              </div>
            ))}
          </div>
          <form onSubmit={addEmployee} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="input" value={newEmployee} onChange={e => setNewEmployee(e.target.value)}
              placeholder="Add a person" aria-label="New person name" />
            <button className="btn-secondary btn" type="submit" disabled={!newEmployee.trim()}>Add</button>
          </form>
          <button className="btn" onClick={handleSaveEmployees} disabled={savingSettings}
            style={{ marginTop: 10 }}>
            {savingSettings ? 'Saving…' : 'Save people order'}
          </button>
        </div>
        {settingsMsg && <div className="error">{settingsMsg}</div>}
        <button className="btn-secondary btn" onClick={handleDeleteProject} disabled={deleting}
          style={{ marginTop: project.source_type === 'google_sheet' ? 4 : 0 }}>
          {deleting ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
      }

      {activeTab === 'attendance' && (
        <AttendanceTable rows={filteredRows} employeeOrder={employeeList} />
      )}
      </main>
    </>
  );
}
