/**
 * Thin API client. All requests are same-origin and send the auth cookie,
 * so the browser never has to hold a token in JavaScript-readable storage.
 */

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.issues = data?.issues;
    throw err;
  }
  return data;
}

export const api = {
  get:  (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put:  (p, b) => request('PUT', p, b),
  del:  (p) => request('DELETE', p),

  // Auth
  signup: (b) => request('POST', '/auth/signup', b),
  login:  (b) => request('POST', '/auth/login', b),
  logout: () => request('POST', '/auth/logout'),
  me:     () => request('GET', '/auth/me'),
  changePassword: (b) => request('POST', '/auth/change-password', b),

  // Academic data
  analysis:  () => request('GET', '/analysis'),
  structure: () => request('GET', '/structure'),
  scales:    () => request('GET', '/scales'),
  profile:   () => request('GET', '/profile'),
  saveProfile: (b) => request('PUT', '/profile', b),

  addSession:    (b) => request('POST', '/sessions', b),
  updateSession: (id, b) => request('PUT', `/sessions/${id}`, b),
  deleteSession: (id) => request('DELETE', `/sessions/${id}`),

  addSemester:    (b) => request('POST', '/semesters', b),
  updateSemester: (id, b) => request('PUT', `/semesters/${id}`, b),
  deleteSemester: (id) => request('DELETE', `/semesters/${id}`),

  addCourse:     (b) => request('POST', '/courses', b),
  addCoursesBulk:(b) => request('POST', '/courses/bulk', b),
  updateCourse:  (id, b) => request('PUT', `/courses/${id}`, b),
  deleteCourse:  (id) => request('DELETE', `/courses/${id}`),

  simulate: (b) => request('POST', '/simulate', b),
  target:   (b) => request('POST', '/target', b),

  goals:      () => request('GET', '/goals'),
  addGoal:    (b) => request('POST', '/goals', b),
  updateGoal: (id, b) => request('PUT', `/goals/${id}`, b),
  deleteGoal: (id) => request('DELETE', `/goals/${id}`),
};

/** Trigger a browser download for one of the export endpoints. */
export function downloadExport(kind) {
  const paths = {
    pdf: '/api/export/transcript.pdf',
    csv: '/api/export/csv',
    json: '/api/export/json',
  };
  window.open(paths[kind], '_blank');
}

/* ------------------------------------------------------------ presentation */

export function gradeClass(grade, points, maxPoint = 5) {
  if (grade == null || points == null) return 'g-none';
  const ratio = points / maxPoint;
  if (ratio >= 0.9) return 'g-top';
  if (ratio >= 0.7) return 'g-mid';
  if (ratio > 0) return 'g-low';
  return 'g-fail';
}

export const fmt = (n, d = 2) => (Number(n) || 0).toFixed(d);
export const fmtUnit = (n) => (Number(n) % 1 === 0 ? String(Number(n)) : Number(n).toFixed(1));

export function toneFor(cgpa, maxPoint = 5) {
  const r = cgpa / maxPoint;
  if (r >= 0.9) return 'excellent';
  if (r >= 0.7) return 'good';
  if (r >= 0.48) return 'fair';
  if (r > 0) return 'warn';
  return 'neutral';
}
