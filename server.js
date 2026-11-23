const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ram.sqlite');
fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
const now = () => new Date().toISOString();
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex')
});
const verifyPassword = (password, salt, expected) => {
  const actual = crypto.scryptSync(password, salt, 64);
  const wanted = Buffer.from(expected, 'hex');
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
};
function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
function run(sql, params = []) { db.run(sql, params); }
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function one(sql, params = []) { return all(sql, params)[0] || null; }
function lastId() { return one('SELECT last_insert_rowid() AS id').id; }
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, studentNumber: user.student_number || null };
}
function seedUser(name, email, password, role, studentNumber = null) {
  const existing = one('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return;
  const pw = hashPassword(password);
  run(`INSERT INTO users (name,email,password_salt,password_hash,role,status,student_number,created_at)
       VALUES (?,?,?,?,?,'Active',?,?)`, [name, email, pw.salt, pw.hash, role, studentNumber, now()]);
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in to continue.' });
  const account = one('SELECT status FROM users WHERE id = ?', [req.session.user.id]);
  if (!account || account.status !== 'Active') {
    return req.session.destroy(() => res.status(401).json({ error: 'This account is inactive. Please contact the program manager.' }));
  }
  next();
}
function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'Manager') return res.status(403).json({ error: 'Manager access is required.' });
  next();
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')); }

(async () => {
  const SQL = await initSqlJs({ locateFile: file => require.resolve(`sql.js/dist/${file}`) });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) : new SQL.Database();
  run('PRAGMA foreign_keys = ON');
  run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Student','Manager')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
    student_number TEXT UNIQUE,
    created_at TEXT NOT NULL
  )`);
  run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    clock_in TEXT NOT NULL,
    clock_out TEXT,
    total_hours REAL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Completed')),
    created_at TEXT NOT NULL,
    CHECK(clock_out IS NULL OR clock_out > clock_in),
    CHECK(total_hours IS NULL OR total_hours >= 0)
  )`);
  run('CREATE INDEX IF NOT EXISTS idx_attendance_user_clockin ON attendance(user_id, clock_in)');
  run("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session_per_student ON attendance(user_id) WHERE status='Active'");
  seedUser('RAM Manager', 'manager@ram.local', 'Manager123!', 'Manager');
  seedUser('Maya Student', 'student@ram.local', 'Student123!', 'Student', 'ROB-1001');
  seedUser('Jordan Student', 'jordan@ram.local', 'Student123!', 'Student', 'ROB-1002');
  if (!one('SELECT id FROM attendance LIMIT 1')) {
    const students = all("SELECT id FROM users WHERE role='Student' ORDER BY id");
    const t1 = new Date(Date.now() - 3 * 86400000);
    const t2 = new Date(Date.now() - 2 * 86400000);
    const t3 = new Date(Date.now() - 86400000);
    const addSample = (uid, start, hours) => {
      const end = new Date(start.getTime() + hours * 3600000);
      run(`INSERT INTO attendance (user_id,clock_in,clock_out,total_hours,status,created_at) VALUES (?,?,?,?, 'Completed',?)`, [uid, start.toISOString(), end.toISOString(), hours, start.toISOString()]);
    };
    if (students[0]) addSample(students[0].id, t1, 2.5);
    if (students[1]) addSample(students[1].id, t2, 1.75);
    if (students[0]) addSample(students[0].id, t3, 3.0);
  }
  saveDb();

  app.use(express.json({ limit: '100kb' }));
  app.use(session({
    name: 'ram.sid',
    secret: process.env.SESSION_SECRET || 'development-only-change-this-secret-before-deployment',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
  }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'RAM', database: 'SQLite' }));
  app.post('/api/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = one('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || user.status !== 'Active' || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: 'Email or password is incorrect, or the account is inactive.' });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not start your session.' });
      req.session.user = publicUser(user);
      res.json({ user: req.session.user });
    });
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.session.user }));

  app.get('/api/student/summary', requireAuth, (req, res) => {
    if (req.session.user.role !== 'Student') return res.status(403).json({ error: 'Student access only.' });
    const uid = req.session.user.id;
    const active = one("SELECT * FROM attendance WHERE user_id=? AND status='Active'", [uid]);
    const totals = one("SELECT COUNT(*) AS sessions, COALESCE(SUM(total_hours),0) AS hours FROM attendance WHERE user_id=? AND status='Completed'", [uid]);
    const recent = all('SELECT id,clock_in,clock_out,total_hours,status FROM attendance WHERE user_id=? ORDER BY clock_in DESC LIMIT 8', [uid]);
    res.json({ active, sessions: totals.sessions, hours: Number(totals.hours.toFixed(2)), recent });
  });
  app.get('/api/attendance/mine', requireAuth, (req, res) => {
    if (req.session.user.role !== 'Student') return res.status(403).json({ error: 'Student access only.' });
    res.json({ records: all('SELECT id,clock_in,clock_out,total_hours,status FROM attendance WHERE user_id=? ORDER BY clock_in DESC', [req.session.user.id]) });
  });
  app.post('/api/attendance/clock-in', requireAuth, (req, res) => {
    if (req.session.user.role !== 'Student') return res.status(403).json({ error: 'Only students can clock in.' });
    const user = one('SELECT status FROM users WHERE id=?', [req.session.user.id]);
    if (!user || user.status !== 'Active') return res.status(403).json({ error: 'Your account is inactive.' });
    if (one("SELECT id FROM attendance WHERE user_id=? AND status='Active'", [req.session.user.id])) return res.status(409).json({ error: 'You are already clocked in.' });
    const timestamp = now();
    run("INSERT INTO attendance (user_id,clock_in,status,created_at) VALUES (?,?, 'Active',?)", [req.session.user.id, timestamp, timestamp]);
    saveDb();
    res.status(201).json({ message: 'You are clocked in.', clockIn: timestamp });
  });
  app.post('/api/attendance/clock-out', requireAuth, (req, res) => {
    if (req.session.user.role !== 'Student') return res.status(403).json({ error: 'Only students can clock out.' });
    const active = one("SELECT * FROM attendance WHERE user_id=? AND status='Active'", [req.session.user.id]);
    if (!active) return res.status(409).json({ error: 'You do not have an active clock-in session.' });
    const clockOut = now();
    const hours = Math.max(0, Math.round(((new Date(clockOut) - new Date(active.clock_in)) / 3600000) * 100) / 100);
    run("UPDATE attendance SET clock_out=?,total_hours=?,status='Completed' WHERE id=?", [clockOut, hours, active.id]);
    saveDb();
    res.json({ message: 'You are clocked out.', hours });
  });

  app.get('/api/manager/students', requireManager, (req, res) => {
    const students = all(`SELECT u.id,u.name,u.email,u.status,u.student_number,u.created_at,
      (SELECT COUNT(*) FROM attendance a WHERE a.user_id=u.id) AS sessions,
      (SELECT COALESCE(SUM(a.total_hours),0) FROM attendance a WHERE a.user_id=u.id AND a.status='Completed') AS hours,
      (SELECT COUNT(*) FROM attendance a WHERE a.user_id=u.id AND a.status='Active') AS active_session
      FROM users u WHERE u.role='Student' ORDER BY u.name`);
    res.json({ students });
  });
  app.post('/api/manager/students', requireManager, (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const studentNumber = String(req.body.studentNumber || '').trim() || null;
    if (!name || !validEmail(email) || password.length < 8) return res.status(400).json({ error: 'Enter a name, valid email, and password of at least 8 characters.' });
    if (one('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error: 'That email address is already in use.' });
    if (studentNumber && one('SELECT id FROM users WHERE student_number=?', [studentNumber])) return res.status(409).json({ error: 'That student number is already in use.' });
    const pw = hashPassword(password);
    run("INSERT INTO users (name,email,password_salt,password_hash,role,status,student_number,created_at) VALUES (?,?,?,?, 'Student','Active',?,?)", [name,email,pw.salt,pw.hash,studentNumber,now()]);
    saveDb();
    res.status(201).json({ message: 'Student account created.' });
  });
  app.put('/api/manager/students/:id', requireManager, (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const studentNumber = String(req.body.studentNumber || '').trim() || null;
    if (!Number.isInteger(id) || !name || !validEmail(email)) return res.status(400).json({ error: 'Enter a valid name and email.' });
    const target = one("SELECT id FROM users WHERE id=? AND role='Student'", [id]);
    if (!target) return res.status(404).json({ error: 'Student not found.' });
    if (one('SELECT id FROM users WHERE email=? AND id<>?', [email,id])) return res.status(409).json({ error: 'That email address is already in use.' });
    if (studentNumber && one('SELECT id FROM users WHERE student_number=? AND id<>?', [studentNumber,id])) return res.status(409).json({ error: 'That student number is already in use.' });
    run('UPDATE users SET name=?,email=?,student_number=? WHERE id=?', [name,email,studentNumber,id]);
    saveDb();
    res.json({ message: 'Student account updated.' });
  });
  app.patch('/api/manager/students/:id/status', requireManager, (req, res) => {
    const id = Number(req.params.id);
    const status = req.body.status;
    if (!Number.isInteger(id) || !['Active','Inactive'].includes(status)) return res.status(400).json({ error: 'Invalid account status.' });
    const target = one("SELECT id FROM users WHERE id=? AND role='Student'", [id]);
    if (!target) return res.status(404).json({ error: 'Student not found.' });
    if (status === 'Inactive' && one("SELECT id FROM attendance WHERE user_id=? AND status='Active'", [id])) return res.status(409).json({ error: 'This student is currently clocked in. They must clock out before deactivation.' });
    run('UPDATE users SET status=? WHERE id=?', [status,id]);
    saveDb();
    res.json({ message: `Student account ${status.toLowerCase()}.` });
  });
  app.get('/api/manager/reports', requireManager, (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    const conditions = [];
    const params = [];
    if (from) {
      const start = new Date(`${from}T00:00:00`);
      if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'Invalid start date.' });
      conditions.push('a.clock_in >= ?'); params.push(start.toISOString());
    }
    if (to) {
      const endExclusive = new Date(`${to}T00:00:00`);
      if (Number.isNaN(endExclusive.getTime())) return res.status(400).json({ error: 'Invalid end date.' });
      endExclusive.setDate(endExclusive.getDate() + 1);
      conditions.push('a.clock_in < ?'); params.push(endExclusive.toISOString());
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const records = all(`SELECT a.id,a.clock_in,a.clock_out,a.total_hours,a.status,u.name,u.email,u.student_number
      FROM attendance a JOIN users u ON u.id=a.user_id ${where} ORDER BY a.clock_in DESC`, params);
    const summaryConditions = [...conditions, "a.status='Completed'"];
    const summaryWhere = `WHERE ${summaryConditions.join(' AND ')}`;
    const summary = one(`SELECT COUNT(*) AS sessions, COUNT(DISTINCT a.user_id) AS students,
      COALESCE(SUM(a.total_hours),0) AS hours FROM attendance a ${summaryWhere}`, params);
    res.json({ records, summary: { sessions: summary.sessions, students: summary.students, hours: Number(summary.hours.toFixed(2)) } });
  });

  app.use('/api', (err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  app.listen(PORT, () => console.log(`RAM prototype running at http://localhost:${PORT}`));
})().catch(err => { console.error('Could not initialize RAM:', err); process.exit(1); });
