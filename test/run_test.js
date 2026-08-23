const fs = require('fs');
const path = require('path');
const { calculateAttendance } = require('../lib/calculateAttendance');

const EMPLOYEES = [
  "Waleed Abdullah","Usama Muhammad Channar","Inshrah Tariq","Mohammad Alizada",
  "Mutee Abdullah","Usama Imran","Adeel Ahmad","Arman Iftikhar","Muhammad Zeshan Tahir",
  "Waqar Tahir","Zeeshan Rana","Abdullah Khan","Waleed Shoaib","Usman Bhatti","Momin Ali",
  "Ahmad Mannan","Umair Ahmed","Salik","Haider Satti","Ali Amer","Abdul Rafay","Hamzah Bilal",
  "Rehan Aziz","Saad Jameel","Taha Sharjeel","Bakhtawar Ismail","Abdullah Khan","Abdul Hanan",
  "Saad Khan","Mariyam Nadeem","Mirza Mukarram","Rizwan Muzammal","Waheed Khan","Ashar Khan"
];

const raw = fs.readFileSync(path.join(__dirname, 'sample_raw.txt'), 'utf8').trim().split('\n');

function parseTimestamp(dateStr, timeStr) {
  // dateStr: DD/MM/YYYY, timeStr: "2:00" (24h, no seconds)
  const [d, m, y] = dateStr.split('/').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0);
}

const events = raw.map(line => {
  const [tsRaw, userRaw, type] = line.split('\t');
  const [dateStr, timeStr] = tsRaw.trim().split(' ');
  const employee = userRaw.split(' (')[0].trim();
  return {
    employee,
    type: type.trim(),
    timestamp: parseTimestamp(dateStr, timeStr),
  };
});

console.log(`Parsed ${events.length} events for ${new Set(events.map(e => e.employee)).size} employees\n`);

const results = calculateAttendance(events, '06:00', EMPLOYEES);

console.log('employee'.padEnd(28), 'date'.padEnd(12), 'checkIn'.padEnd(9), 'checkOut'.padEnd(9), 'break'.padEnd(10), 'workingHours');
for (const r of results) {
  console.log(
    r.employee.padEnd(28),
    r.date.padEnd(12),
    (r.checkIn || '-').padEnd(9),
    (r.checkOut || '-').padEnd(9),
    r.break.padEnd(10),
    r.workingHours
  );
}
