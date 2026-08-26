'use client';

export default function AttendanceTable({ rows, employeeOrder }) {
  // Group rows by date
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Map());
    byDate.get(r.date).set(r.employee, r);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1)); // desc

  if (dates.length === 0) {
    return <div className="card" style={{ color: 'var(--muted)' }}>No records in this date range yet. Try syncing or widening the date filter.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {dates.map(date => {
        const dayRows = byDate.get(date);
        return (
          <div key={date} className="card">
            <h3 style={{ marginTop: 0, fontSize: 15 }}>{formatDate(date)}</h3>
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Check-in - Check-out</th>
                  <th>Break (HH:MM:SS)</th>
                  <th>Working hours</th>
                </tr>
              </thead>
              <tbody>
                {employeeOrder.map(name => {
                  const r = dayRows.get(name);
                  const absent = !r;
                  return (
                    <tr key={name} className={absent ? 'attendance-absent' : ''}>
                      <td>{name}</td>
                      <td>{r ? formatPunches(r) : '—'}</td>
                      <td>{r?.break || '—'}</td>
                      <td>{r ? r.workingHours : <span className="absent-label">Absent</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function formatPunches(row) {
  if (row.sessions?.length) return row.sessions.map(session => `${session.checkIn || '—'} - ${session.checkOut || '—'}`).join('; ');
  if (row.checkIn || row.checkOut) return `${row.checkIn || '—'} - ${row.checkOut || '—'}`;
  return '—';
}

function formatDate(dateKey) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
