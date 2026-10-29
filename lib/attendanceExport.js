function formatPunches(row) {
  if (row.sessions?.length) {
    return row.sessions
      .map(session => `${session.checkIn || '—'} - ${session.checkOut || '—'}`)
      .join('; ');
  }
  if (row.checkIn || row.checkOut) return `${row.checkIn || '—'} - ${row.checkOut || '—'}`;
  return '—';
}

function buildAttendanceSheetRows(attendanceRows, employeeOrder = [], fromDate = null, toDate = null) {
  const rowsByDate = new Map();
  for (const row of attendanceRows) {
    if ((fromDate && row.date < fromDate) || (toDate && row.date > toDate)) continue;
    if (!rowsByDate.has(row.date)) rowsByDate.set(row.date, new Map());
    rowsByDate.get(row.date).set(row.employee, row);
  }

  const values = [];
  const dates = [...rowsByDate.keys()].sort();
  for (const date of dates) {
    const dayRows = rowsByDate.get(date);
    const employees = [...new Set([
      ...employeeOrder,
      ...dayRows.keys(),
    ])];

    values.push([date, '', '', '']);
    values.push(['NAME', 'CHECKIN- CHECKOUT', 'BREAK', 'WORKING HOURS']);
    for (const employee of employees) {
      const row = dayRows.get(employee);
      values.push(row
        ? [employee, formatPunches(row), row.break, row.workingHours]
        : [employee, 'Absent', 'Absent', 'Absent']);
    }
    values.push(['', '', '', '']);
  }

  return { values, dates };
}

module.exports = { buildAttendanceSheetRows };
