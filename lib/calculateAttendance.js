/**
 * calculateAttendance.js
 *
 * Turns a flat log of punch events (check-in / check-out / break-start / break-end)
 * into per-employee, per-business-day summaries:
 *   { employee, date, checkIn, checkOut, breakMinutes, workingMinutes }
 *
 * "Business day" logic:
 *   The user picks a boundary time, e.g. 06:00. A business day D runs from
 *   D 06:00:00  ->  D+1 06:00:00 (exclusive). Any event that falls in that
 *   window belongs to business day D, even if it's technically past midnight.
 *
 * Event shape expected (already normalized from the sheet):
 *   { employee: string, type: 'check-in'|'check-out'|'break-start'|'break-end', timestamp: Date }
 */

/** Given an event timestamp and boundary "HH:mm", return the business-day date string (YYYY-MM-DD) it belongs to. */
function getBusinessDay(timestamp, boundaryHHMM) {
  const [bH, bM] = boundaryHHMM.split(':').map(Number);
  const boundaryMinutes = bH * 60 + bM;
  const eventMinutes = timestamp.getHours() * 60 + timestamp.getMinutes();

  const businessDate = new Date(timestamp);
  if (eventMinutes < boundaryMinutes) {
    // Before today's boundary -> belongs to yesterday's business day
    businessDate.setDate(businessDate.getDate() - 1);
  }
  return toDateKey(businessDate);
}

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtTime(d) {
  if (!d) return null;
  return d.toTimeString().slice(0, 8); // HH:mm:ss
}

function secondsBetween(a, b) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
}

function secondsToHHMMSS(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(value => String(value).padStart(2, '0')).join(':');
}

/**
 * @param {Array<{employee:string,type:string,timestamp:Date}>} events - raw punch events, any order
 * @param {string} boundaryHHMM - e.g. "06:00"
 * @param {string[]} employeeOrder - the fixed employee list, used to order + fill in absentees
 * @returns {Array} per-employee-per-day summary rows, sorted by date desc then employeeOrder
 */
function calculateAttendance(events, boundaryHHMM, employeeOrder = []) {
  // 1. Group events by employee, sort chronologically
  const byEmployee = new Map();
  for (const ev of events) {
    if (!byEmployee.has(ev.employee)) byEmployee.set(ev.employee, []);
    byEmployee.get(ev.employee).push(ev);
  }
  for (const list of byEmployee.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  // rows keyed by `${employee}|${businessDay}`
  const rows = new Map();

  function getRow(employee, day) {
    const key = `${employee}|${day}`;
    if (!rows.has(key)) {
      rows.set(key, {
        employee,
        date: day,
        checkIn: null,
        checkOut: null,
        sessionSeconds: 0,
        breakSeconds: 0,
        _openCheckIn: null, // unmatched check-in carried across events
      });
    }
    return rows.get(key);
  }

  // 2. Walk each employee's timeline, pairing check-in->check-out and break-start->break-end.
  //    A session/break is assigned to the business day of its START event.
  for (const [employee, list] of byEmployee.entries()) {
    let openCheckIn = null;
    let openCheckInDay = null; // business day of the current open session (breaks inherit this)
    let openBreak = null;

    for (const ev of list) {
      if (ev.type === 'check-in') {
        // If there was already an open check-in with no check-out (missed punch), it's simply replaced
        openCheckIn = ev;
        openCheckInDay = getBusinessDay(ev.timestamp, boundaryHHMM);
        openBreak = null;
      } else if (ev.type === 'check-out') {
        if (openCheckIn) {
          const day = openCheckInDay;
          const row = getRow(employee, day);
          const seconds = secondsBetween(openCheckIn.timestamp, ev.timestamp);
          row.sessionSeconds += seconds;
          if (!row.checkIn || openCheckIn.timestamp < row.checkIn) row.checkIn = openCheckIn.timestamp;
          if (!row.checkOut || ev.timestamp > row.checkOut) row.checkOut = ev.timestamp;
          openCheckIn = null;
          openCheckInDay = null;
          // A break without an end before checkout belongs to no completed session.
          openBreak = null;
        }
        // a check-out with no matching check-in is ignored (bad data / prior period)
      } else if (ev.type === 'break-start') {
        if (openCheckIn) openBreak = ev;
      } else if (ev.type === 'break-end') {
        if (openBreak && openCheckIn) {
          // A break taken mid-session belongs to that session's business day, even if the
          // break itself straddles the boundary. If there's no open session (edge case /
          // bad data), fall back to the break-start's own business day.
          const day = openCheckInDay || getBusinessDay(openBreak.timestamp, boundaryHHMM);
          const row = getRow(employee, day);
          row.breakSeconds += secondsBetween(openBreak.timestamp, ev.timestamp);
          openBreak = null;
        }
      }
    }

    // Still checked in at the end of the data (no check-out yet) -> show check-in only, no working hours yet
    if (openCheckIn) {
      const day = getBusinessDay(openCheckIn.timestamp, boundaryHHMM);
      const row = getRow(employee, day);
      if (!row.checkIn || openCheckIn.timestamp < row.checkIn) row.checkIn = openCheckIn.timestamp;
    }
  }

  // 3. Finalize rows: working minutes = session time - break time
  const result = [];
  for (const row of rows.values()) {
    const workingSeconds = Math.max(0, row.sessionSeconds - row.breakSeconds);
    result.push({
      employee: row.employee,
      date: row.date,
      checkIn: fmtTime(row.checkIn),
      checkOut: fmtTime(row.checkOut),
      break: secondsToHHMMSS(row.breakSeconds),
      breakSeconds: row.breakSeconds,
      workingHours: secondsToHHMMSS(workingSeconds),
      workingSeconds,
      breakMinutes: Math.floor(row.breakSeconds / 60),
      workingMinutes: Math.floor(workingSeconds / 60),
    });
  }

  // 4. Sort: date desc, then by the fixed employee order
  const orderIndex = new Map(employeeOrder.map((name, i) => [name, i]));
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ai = orderIndex.has(a.employee) ? orderIndex.get(a.employee) : 999;
    const bi = orderIndex.has(b.employee) ? orderIndex.get(b.employee) : 999;
    return ai - bi;
  });

  return result;
}

module.exports = { calculateAttendance, getBusinessDay, toDateKey };
