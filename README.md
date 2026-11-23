# RAM — Robotics Attendance Management

A polished, desktop-first attendance management prototype for the CNIT 315 Group 2 semester project.

## What is included

### Student workspace
- Secure login with role-based access
- Clock in and clock out
- Prevents duplicate active sessions
- Calculates session duration to two decimal places
- Dashboard with total hours, completed sessions, and current session status
- Search-free personal attendance history with status filter

### Manager workspace
- Dashboard with student, hour, and live-session summaries
- Create student accounts
- Edit student profile information
- Activate and deactivate student accounts
- Prevents deactivation while a student is clocked in
- Search and filter student directory
- Attendance reports with date range, student search, and status filters
- Export report data to CSV

### Technical features
- Node.js and Express API
- SQLite database using `sql.js` (no native compilation required)
- Passwords stored using salted `scrypt` hashes
- Server-side role checks for manager and student routes
- Unique email and student-number constraints
- Database index prevents more than one active session per student
- Data persists in `data/ram.sqlite`

## Requirements
- Node.js 20 or newer (Node.js 22 or 24 LTS recommended)
- Visual Studio Code or another code editor

## Run on Windows with VS Code

1. Extract the project ZIP to a normal folder, such as `Documents\CNIT315\ram-prototype`.
2. Open that folder in VS Code.
3. Select **Terminal → New Terminal**.
4. Confirm the terminal is in the folder containing `package.json`.
5. Install the packages:

   ```powershell
   npm.cmd install
   ```

6. Start RAM:

   ```powershell
   npm.cmd start
   ```

7. Open **http://localhost:3000** in your browser. Keep the terminal open while using RAM.

If PowerShell blocks `npm`, use `npm.cmd`. If port 3000 is already occupied, run `$env:PORT=3001` before starting and open `http://localhost:3001`.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Manager | manager@ram.local | Manager123! |
| Student | student@ram.local | Student123! |
| Student | jordan@ram.local | Student123! |

The application creates demo accounts and sample attendance records on first run. Use only these sample accounts for the classroom demonstration.

## Suggested demonstration flow

1. Sign in as the student.
2. Review the dashboard and attendance history.
3. Clock in and verify the active-session state.
4. Try clocking in again; RAM should reject a duplicate session.
5. Clock out and verify the calculated duration.
6. Sign out and sign in as the manager.
7. Add a student, edit the profile, and deactivate/reactivate the account.
8. Review live attendance and generate a date-filtered report.
9. Search/filter report records and export CSV.

## Project structure

```text
ram-prototype/
  public/
    index.html
    styles.css
    app.js
  presentation/
    diagrams.md
    slide-outline.md
  data/                 created automatically
  server.js
  package.json
  README.md
```

## Important prototype notes

- This is a classroom prototype, not a production deployment.
- The original RAM design proposes MySQL. This local demonstration uses SQLite to simplify setup; the logical tables and relationships are transferable to MySQL.
- The default Express session store is in memory, so login sessions reset when the server restarts.
- The session secret is a development default. Set a long random `SESSION_SECRET` before any shared deployment.
- No email delivery, password reset, payroll, mobile interface, or geolocation is included.
- Back up `data/ram.sqlite` before deleting or replacing the project folder.

## Presentation resources

See `presentation/diagrams.md` for editable Mermaid diagrams and `presentation/slide-outline.md` for the recommended slide sequence. Capture screenshots from the running application rather than using generic UI images.
