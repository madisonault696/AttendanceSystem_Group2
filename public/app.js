'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let currentUser = null;
let activePage = 'dashboard';
let studentsCache = [];
let reportCache = [];
let clockTimer = null;
let toastTimer = null;

const loginView = $('#loginView');
const appView = $('#appView');
const content = $('#content');
const initials = name => String(name || 'U').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmtDate = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtDay = value => value ? new Date(value).toLocaleDateString([], { dateStyle: 'medium' }) : '—';
const fmtHours = value => `${Number(value || 0).toFixed(2)} h`;
const localDateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function toast(message, bad = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function setBusy(button, busy, label = 'Working…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `<span class="button-spinner"></span>${label}`;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalText || button.innerHTML;
    button.disabled = false;
  }
}

function showLogin() {
  currentUser = null;
  clearInterval(clockTimer);
  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#loginForm').reset();
  $('#loginError').textContent = '';
}

function showApp(user) {
  currentUser = user;
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  $('#sideName').textContent = user.name;
  $('#sideRole').textContent = `${user.role} account`;
  $('#avatar').textContent = initials(user.name);
  $('#topName').textContent = user.name;
  $('#topAvatar').textContent = initials(user.name);
  buildNav();
  go('dashboard');
}

function buildNav() {
  const items = currentUser.role === 'Student'
    ? [['dashboard', '⌂', 'Overview'], ['history', '◷', 'My attendance']]
    : [['dashboard', '⌂', 'Overview'], ['students', '♙', 'Student accounts'], ['reports', '▤', 'Attendance reports']];
  $('#nav').innerHTML = items.map(([id, icon, label]) => `
    <button class="nav-item ${activePage === id ? 'active' : ''}" data-page="${id}" type="button">
      <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
    </button>`).join('');
  $$('#nav [data-page]').forEach(button => button.addEventListener('click', () => go(button.dataset.page)));
}

async function go(page) {
  const allowed = currentUser.role === 'Student' ? ['dashboard', 'history'] : ['dashboard', 'students', 'reports'];
  if (!allowed.includes(page)) page = 'dashboard';
  activePage = page;
  clearInterval(clockTimer);
  buildNav();
  const titles = { dashboard: 'Overview', history: 'My attendance', students: 'Student accounts', reports: 'Attendance reports' };
  $('#pageTitle').textContent = titles[page];
  content.innerHTML = '<div class="loading-state"><div class="skeleton"></div>Loading your workspace…</div>';
  try {
    if (page === 'dashboard') currentUser.role === 'Student' ? await studentDashboard() : await managerDashboard();
    if (page === 'history') await studentHistory();
    if (page === 'students') await studentManagement();
    if (page === 'reports') await reports();
  } catch (error) {
    content.innerHTML = `<div class="inline-error">${escapeHtml(error.message)} <button class="link-button" id="retryPage">Try again</button></div>`;
    $('#retryPage')?.addEventListener('click', () => go(page));
  }
}

function pageHeading(title, subtitle, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">${currentUser.role === 'Manager' ? 'MANAGER WORKSPACE' : 'STUDENT WORKSPACE'}</span><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function statCard(label, value, note, icon, tint = '#e7f6f2', accent = '#128b74') {
  return `<article class="stat-card" style="--tint:${tint};--accent:${accent}"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
}

function statusPill(status) {
  const classes = { Active: 'status-active', Completed: 'status-completed', Inactive: 'status-inactive' };
  return `<span class="status-pill ${classes[status] || 'status-neutral'}">${escapeHtml(status || 'Unknown')}</span>`;
}

function attendanceStatusPill(status) {
  const className = status === 'Active' ? 'status-progress' : status === 'Completed' ? 'status-completed' : 'status-neutral';
  const label = status === 'Active' ? 'In progress' : status;
  return `<span class="status-pill ${className}">${escapeHtml(label || 'Unknown')}</span>`;
}

function personCell(name, subline) {
  return `<div class="person-cell"><span class="person-avatar">${escapeHtml(initials(name))}</span><span><span class="person-name">${escapeHtml(name)}</span><span class="person-sub">${escapeHtml(subline || '')}</span></span></div>`;
}

function emptyRow(columns, message = 'No records to display yet.') {
  return `<tr><td colspan="${columns}" class="empty-state"><div class="empty-icon">◷</div>${message}</td></tr>`;
}

async function studentDashboard() {
  const data = await api('/api/student/summary');
  const firstName = currentUser.name.trim().split(/\s+/)[0];
  const active = Boolean(data.active);
  content.innerHTML = `
    ${pageHeading(`Good to see you, ${escapeHtml(firstName)}.`, 'Here is your attendance snapshot for the robotics program.', `<div class="date-chip">◷ <span id="todayDate"></span></div>`)}
    <div class="stat-grid">
      ${statCard('TOTAL COMPLETED HOURS', fmtHours(data.hours), 'Your recorded participation time', '◷', '#e7f6f2', '#138b73')}
      ${statCard('COMPLETED SESSIONS', data.sessions, 'Attendance sessions completed', '✓', '#edf2ff', '#5276d1')}
      ${statCard('CURRENT SESSION', active ? 'In progress' : 'Not started', active ? `Started ${fmtDate(data.active.clock_in)}` : 'Ready when you begin', '◉', '#fff4e4', '#b77a2c')}
    </div>
    <section class="clock-card">
      <div><div class="clock-kicker">YOUR ATTENDANCE STATUS</div><div class="clock-display" id="liveClock">--:--:--</div><div class="clock-subtitle">${active ? `You clocked in at ${fmtDate(data.active.clock_in)}. Remember to clock out when finished.` : 'Clock in when you begin your robotics program session.'}</div></div>
      <div class="clock-controls">${active ? '<span class="status-pill status-progress">Session active</span><button id="clockOut" class="button button-clock-out">Clock out <span>↗</span></button>' : '<span class="status-pill status-neutral">Not clocked in</span><button id="clockIn" class="button button-clock-in">Clock in <span>↗</span></button>'}</div>
    </section>
    <section class="panel"><div class="panel-head"><div><h3>Recent attendance</h3><p>Your latest recorded sessions</p></div><button class="link-button" id="allHistory">View full history ↗</button></div>
      <div class="table-wrap"><table><thead><tr><th>Session date</th><th>Clock in</th><th>Clock out</th><th>Recorded hours</th><th>Status</th></tr></thead><tbody>
      ${data.recent.length ? data.recent.map(record => `<tr><td>${fmtDay(record.clock_in)}</td><td>${fmtDate(record.clock_in)}</td><td>${fmtDate(record.clock_out)}</td><td>${record.total_hours == null ? '—' : fmtHours(record.total_hours)}</td><td>${attendanceStatusPill(record.status)}</td></tr>`).join('') : emptyRow(5, 'Your completed sessions will appear here.')}
      </tbody></table></div></section>`;
  $('#todayDate').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const tick = () => { const clock = $('#liveClock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  tick(); clearInterval(clockTimer); clockTimer = setInterval(tick, 1000);
  $('#clockIn')?.addEventListener('click', async event => {
    const button = event.currentTarget; setBusy(button, true, 'Clocking in…');
    try { const result = await api('/api/attendance/clock-in', { method: 'POST', body: '{}' }); toast(result.message); await studentDashboard(); }
    catch (error) { toast(error.message, true); setBusy(button, false); }
  });
  $('#clockOut')?.addEventListener('click', async event => {
    if (!confirm('Clock out of your current attendance session?')) return;
    const button = event.currentTarget; setBusy(button, true, 'Clocking out…');
    try { const result = await api('/api/attendance/clock-out', { method: 'POST', body: '{}' }); toast(`Clock-out saved · ${fmtHours(result.hours)} recorded`); await studentDashboard(); }
    catch (error) { toast(error.message, true); setBusy(button, false); }
  });
  $('#allHistory').addEventListener('click', () => go('history'));
}

async function studentHistory() {
  const data = await api('/api/attendance/mine');
  const completed = data.records.filter(record => record.status === 'Completed');
  const totalHours = completed.reduce((sum, record) => sum + Number(record.total_hours || 0), 0);
  content.innerHTML = `
    ${pageHeading('Your attendance history', 'Review every recorded robotics participation session.', `<div class="date-chip">${data.records.length} total records</div>`)}
    <div class="summary-grid"><div class="summary-tile"><span>TOTAL SESSIONS</span><b>${data.records.length}</b></div><div class="summary-tile"><span>COMPLETED SESSIONS</span><b>${completed.length}</b></div><div class="summary-tile"><span>TOTAL HOURS</span><b>${fmtHours(totalHours)}</b></div></div>
    <section class="panel"><div class="panel-head"><div><h3>Attendance records</h3><p>Most recent sessions appear first.</p></div><div class="toolbar"><select id="historyFilter" class="filter-select" aria-label="Filter by status"><option value="all">All statuses</option><option value="Completed">Completed</option><option value="Active">In progress</option></select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Session date</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Status</th></tr></thead><tbody id="historyRows"></tbody></table></div></section>`;
  const render = () => {
    const filter = $('#historyFilter').value;
    const records = data.records.filter(record => filter === 'all' || record.status === filter);
    $('#historyRows').innerHTML = records.length ? records.map(record => `<tr><td>${fmtDay(record.clock_in)}</td><td>${fmtDate(record.clock_in)}</td><td>${fmtDate(record.clock_out)}</td><td>${record.total_hours == null ? '—' : fmtHours(record.total_hours)}</td><td>${attendanceStatusPill(record.status)}</td></tr>`).join('') : emptyRow(5, 'No sessions match this filter.');
  };
  $('#historyFilter').addEventListener('change', render); render();
}

async function managerDashboard() {
  const [studentData, reportData] = await Promise.all([api('/api/manager/students'), api('/api/manager/reports')]);
  const students = studentData.students;
  const activeStudents = students.filter(student => student.status === 'Active').length;
  const currentlyClockedIn = students.filter(student => Number(student.active_session) > 0).length;
  const activeSessions = reportData.records.filter(record => record.status === 'Active');
  content.innerHTML = `
    ${pageHeading('Program overview', 'A live snapshot of student accounts and attendance activity.', '<button class="button button-primary" id="addStudentTop">＋ Add student</button>')}
    <div class="stat-grid">
      ${statCard('ACTIVE STUDENTS', activeStudents, `${students.length} student accounts in directory`, '♙', '#edf2ff', '#5276d1')}
      ${statCard('COMPLETED HOURS', fmtHours(reportData.summary.hours), 'Across all completed sessions', '◷', '#e7f6f2', '#138b73')}
      ${statCard('CURRENTLY CLOCKED IN', currentlyClockedIn, 'Students with an active session', '◉', '#fff4e4', '#b77a2c')}
    </div>
    <section class="panel"><div class="panel-head"><div><h3>Student directory snapshot</h3><p>Account status and recorded participation</p></div><button class="link-button" id="manageStudents">Manage all students ↗</button></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Student ID</th><th>Account</th><th>Sessions</th><th>Total hours</th></tr></thead><tbody>
      ${students.length ? students.slice(0, 6).map(student => `<tr><td>${personCell(student.name, student.email)}</td><td>${escapeHtml(student.student_number || '—')}</td><td>${statusPill(student.status)}</td><td>${student.sessions}</td><td>${fmtHours(student.hours)}</td></tr>`).join('') : emptyRow(5, 'Add your first student to get started.')}
      </tbody></table></div></section>
    <section class="panel"><div class="panel-head"><div><h3>Live attendance</h3><p>Students who are currently clocked in</p></div><span class="status-pill ${activeSessions.length ? 'status-progress' : 'status-neutral'}">${activeSessions.length} active</span></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Clock-in time</th><th>Session status</th></tr></thead><tbody>
      ${activeSessions.length ? activeSessions.map(record => `<tr><td>${personCell(record.name, record.student_number || record.email)}</td><td>${fmtDate(record.clock_in)}</td><td>${attendanceStatusPill('Active')}</td></tr>`).join('') : emptyRow(3, 'No students are currently clocked in.')}
      </tbody></table></div></section>`;
  $('#addStudentTop').addEventListener('click', () => openStudentDialog());
  $('#manageStudents').addEventListener('click', () => go('students'));
}

async function studentManagement() {
  const data = await api('/api/manager/students');
  studentsCache = data.students;
  content.innerHTML = `
    ${pageHeading('Student accounts', 'Create, update, and manage student access to RAM.', '<button class="button button-primary" id="addStudent">＋ Add student</button>')}
    <div class="summary-grid"><div class="summary-tile"><span>TOTAL STUDENTS</span><b>${studentsCache.length}</b></div><div class="summary-tile"><span>ACTIVE ACCOUNTS</span><b>${studentsCache.filter(student => student.status === 'Active').length}</b></div><div class="summary-tile"><span>INACTIVE ACCOUNTS</span><b>${studentsCache.filter(student => student.status === 'Inactive').length}</b></div></div>
    <section class="panel"><div class="panel-head"><div><h3>Student directory</h3><p>Search by name, email, or student number.</p></div><div class="toolbar"><div class="search-wrap"><input id="studentSearch" type="search" placeholder="Search students…" aria-label="Search students"></div><select id="studentStatusFilter" class="filter-select" aria-label="Filter student status"><option value="all">All accounts</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Student number</th><th>Account status</th><th>Sessions</th><th>Total hours</th><th>Actions</th></tr></thead><tbody id="studentRows"></tbody></table></div></section>`;
  $('#addStudent').addEventListener('click', () => openStudentDialog());
  const render = () => {
    const query = $('#studentSearch').value.trim().toLowerCase();
    const status = $('#studentStatusFilter').value;
    const filtered = studentsCache.filter(student => {
      const matchesQuery = [student.name, student.email, student.student_number].join(' ').toLowerCase().includes(query);
      return matchesQuery && (status === 'all' || student.status === status);
    });
    renderStudentRows(filtered);
  };
  $('#studentSearch').addEventListener('input', render);
  $('#studentStatusFilter').addEventListener('change', render);
  render();
}

function renderStudentRows(rows) {
  const body = $('#studentRows');
  if (!rows.length) { body.innerHTML = emptyRow(6, 'No student accounts match your search.'); return; }
  body.innerHTML = rows.map(student => `<tr>
    <td>${personCell(student.name, student.email)}</td><td>${escapeHtml(student.student_number || '—')}</td><td>${statusPill(student.status)}</td><td>${student.sessions}</td><td>${fmtHours(student.hours)}</td>
    <td><div class="toolbar"><button class="table-action" data-edit="${student.id}" type="button">Edit</button><button class="table-action ${student.status === 'Active' ? 'danger' : ''}" data-status="${student.id}" data-next="${student.status === 'Active' ? 'Inactive' : 'Active'}" type="button">${student.status === 'Active' ? 'Deactivate' : 'Activate'}</button></div></td>
  </tr>`).join('');
  $$('[data-edit]', body).forEach(button => button.addEventListener('click', () => openStudentDialog(studentsCache.find(student => student.id === Number(button.dataset.edit)))));
  $$('[data-status]', body).forEach(button => button.addEventListener('click', async () => {
    const next = button.dataset.next;
    const student = studentsCache.find(item => item.id === Number(button.dataset.status));
    if (!confirm(`${next} ${student?.name || 'this student'}'s account?`)) return;
    button.disabled = true;
    try {
      const result = await api(`/api/manager/students/${button.dataset.status}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast(result.message); await studentManagement();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  }));
}

function openStudentDialog(student = null) {
  const dialog = $('#studentDialog');
  const form = $('#studentForm');
  form.reset();
  form.elements.id.value = student?.id || '';
  form.elements.name.value = student?.name || '';
  form.elements.email.value = student?.email || '';
  form.elements.studentNumber.value = student?.student_number || '';
  form.elements.password.value = '';
  form.elements.password.required = !student;
  $('#passwordField').classList.toggle('hidden', Boolean(student));
  $('#studentDialogTitle').textContent = student ? 'Edit student account' : 'Add a student';
  $('#studentFormError').textContent = '';
  dialog.showModal();
  setTimeout(() => form.elements.name.focus(), 50);
}

function closeStudentDialog() { $('#studentDialog').close(); }
$('#closeStudentDialog').addEventListener('click', closeStudentDialog);
$('#cancelStudent').addEventListener('click', closeStudentDialog);
$('#studentDialog').addEventListener('click', event => { if (event.target === $('#studentDialog')) closeStudentDialog(); });
$('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const body = { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), studentNumber: form.elements.studentNumber.value.trim(), password: form.elements.password.value };
  const submit = $('button[type="submit"]', form);
  $('#studentFormError').textContent = '';
  setBusy(submit, true, 'Saving…');
  try {
    const result = await api(id ? `/api/manager/students/${id}` : '/api/manager/students', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
    closeStudentDialog(); toast(result.message); await go(activePage);
  } catch (error) { $('#studentFormError').textContent = error.message; }
  finally { setBusy(submit, false); }
});

async function reports() {
  const today = new Date();
  const start = new Date(today); start.setDate(start.getDate() - 30);
  content.innerHTML = `
    ${pageHeading('Attendance reports', 'Explore session activity, review participation hours, and export records.', `<div class="date-chip">▤ Program analytics</div>`)}
    <section class="panel"><div class="panel-head"><div><h3>Report filters</h3><p>Filter attendance by the date students clocked in.</p></div></div>
      <div class="report-filter-row"><label class="filter-field">FROM DATE<input class="date-input" type="date" id="fromDate" value="${localDateValue(start)}"></label><label class="filter-field">TO DATE<input class="date-input" type="date" id="toDate" value="${localDateValue(today)}"></label><button class="button button-primary" id="runReport">Generate report ↗</button><button class="button button-light" id="resetReport">Reset dates</button></div>
    </section><div id="reportResult"><div class="loading-state">Preparing attendance report…</div></div>`;
  $('#runReport').addEventListener('click', loadReport);
  $('#resetReport').addEventListener('click', () => { $('#fromDate').value = ''; $('#toDate').value = ''; loadReport(); });
  await loadReport();
}

async function loadReport() {
  const from = $('#fromDate').value;
  const to = $('#toDate').value;
  if (from && to && from > to) { toast('The start date must be on or before the end date.', true); return; }
  const button = $('#runReport');
  if (button) setBusy(button, true, 'Generating…');
  try {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const data = await api(`/api/manager/reports?${query.toString()}`);
    reportCache = data.records;
    renderReport(data);
  } catch (error) { $('#reportResult').innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`; }
  finally { if (button) setBusy(button, false); }
}

function renderReport(data) {
  const records = data.records;
  const completed = records.filter(record => record.status === 'Completed');
  const active = records.filter(record => record.status === 'Active');
  $('#reportResult').innerHTML = `
    <div class="stat-grid">
      ${statCard('COMPLETED HOURS', fmtHours(data.summary.hours), 'Within selected date range', '◷', '#e7f6f2', '#138b73')}
      ${statCard('COMPLETED SESSIONS', data.summary.sessions, 'Successfully completed sessions', '✓', '#edf2ff', '#5276d1')}
      ${statCard('STUDENTS WITH COMPLETED SESSIONS', data.summary.students, `${active.length} active session${active.length === 1 ? '' : 's'} in range`, '♙', '#fff4e4', '#b77a2c')}
    </div>
    <section class="panel"><div class="panel-head"><div><h3>Attendance detail</h3><p>${records.length} attendance record${records.length === 1 ? '' : 's'} found · ${completed.length} completed · ${active.length} in progress</p></div><div class="toolbar"><div class="search-wrap"><input id="reportSearch" type="search" placeholder="Search student…" aria-label="Search report students"></div><select id="reportStatus" class="filter-select" aria-label="Filter report status"><option value="all">All statuses</option><option value="Completed">Completed</option><option value="Active">In progress</option></select><button class="button button-light button-small" id="exportCsv">↓ Export CSV</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Clock in</th><th>Clock out</th><th>Duration</th><th>Status</th></tr></thead><tbody id="reportRows"></tbody></table></div></section>`;
  const render = () => {
    const query = $('#reportSearch').value.trim().toLowerCase();
    const status = $('#reportStatus').value;
    const filtered = records.filter(record => [record.name, record.email, record.student_number].join(' ').toLowerCase().includes(query) && (status === 'all' || record.status === status));
    $('#reportRows').innerHTML = filtered.length ? filtered.map(record => `<tr><td>${personCell(record.name, record.student_number || record.email)}</td><td>${fmtDate(record.clock_in)}</td><td>${fmtDate(record.clock_out)}</td><td>${record.total_hours == null ? '—' : fmtHours(record.total_hours)}</td><td>${attendanceStatusPill(record.status)}</td></tr>`).join('') : emptyRow(5, 'No attendance records match these filters.');
  };
  $('#reportSearch').addEventListener('input', render);
  $('#reportStatus').addEventListener('change', render);
  $('#exportCsv').addEventListener('click', () => exportCSV(records));
  render();
}

function exportCSV(records) {
  const rows = [['Student', 'Email', 'Student Number', 'Clock In', 'Clock Out', 'Hours', 'Status'], ...records.map(record => [record.name, record.email, record.student_number || '', record.clock_in, record.clock_out || '', record.total_hours ?? '', record.status])];
  const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `ram-attendance-${localDateValue(new Date())}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  toast('Attendance report exported as CSV.');
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  $('#loginError').textContent = '';
  setBusy(button, true, 'Signing in…');
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value }) });
    form.reset(); showApp(data.user);
  } catch (error) { $('#loginError').textContent = error.message; }
  finally { setBusy(button, false); }
});

$('#togglePassword').addEventListener('click', () => {
  const input = $('#loginPassword');
  const showing = input.type === 'password';
  input.type = showing ? 'text' : 'password';
  $('#togglePassword').textContent = showing ? 'Hide' : 'Show';
  $('#togglePassword').setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
});

$$('[data-demo]').forEach(button => button.addEventListener('click', () => {
  const manager = button.dataset.demo === 'manager';
  $('#loginEmail').value = manager ? 'manager@ram.local' : 'student@ram.local';
  $('#loginPassword').value = manager ? 'Manager123!' : 'Student123!';
  $('#loginError').textContent = '';
  $('#loginPassword').focus();
}));

$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); }
  catch (error) { toast(error.message, true); }
  finally { showLogin(); }
});

(async () => {
  try { const data = await api('/api/me'); showApp(data.user); }
  catch { showLogin(); }
})();
