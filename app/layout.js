import './globals.css';

export const metadata = {
  title: 'Attendance Automation',
  description: 'Automated attendance & working hours from your spreadsheet',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
