# Attendance Desk

## Run locally

Install dependencies and start the development server:

```powershell
npm install
npm run dev
```

Open http://localhost:3000. Configure the Supabase values in `.env.local` before
signing in or using project data.

## Export attendance reports

Choose a date range and select **Export to CSV**. The downloaded file is ready
to open or import in Google Sheets and has one date block per day: a date row,
then `NAME | CHECKIN- CHECKOUT | BREAK | WORKING HOURS`, followed by each
configured employee. Employees without attendance that day are included and
marked `Absent`. No Google Sheets API credentials are required.