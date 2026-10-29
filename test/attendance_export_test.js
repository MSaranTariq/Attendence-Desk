const assert = require('assert');
const { buildAttendanceSheetRows } = require('../lib/attendanceExport');

const { values, dates } = buildAttendanceSheetRows([
  {
    employee: 'Amina',
    date: '2026-10-28',
    checkIn: '8:00 AM',
    checkOut: '4:00 PM',
    break: '00:30:00',
    workingHours: '07:30:00',
    sessions: [{ checkIn: '8:00 AM', checkOut: '4:00 PM' }],
  },
], ['Amina', 'Bilal'], '2026-10-28', '2026-10-29');

assert.deepStrictEqual(dates, ['2026-10-28']);
assert.deepStrictEqual(values, [
  ['2026-10-28', '', '', ''],
  ['NAME', 'CHECKIN- CHECKOUT', 'BREAK', 'WORKING HOURS'],
  ['Amina', '8:00 AM - 4:00 PM', '00:30:00', '07:30:00'],
  ['Bilal', 'Absent', 'Absent', 'Absent'],
  ['', '', '', ''],
]);

console.log('Attendance export formatting tests passed.');
