const base = '';

async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = new Error(res.statusText);
    err.status = res.status;
    let body;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    err.body = body;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const getMe = () => request('/api/me');
export const login = (email, password) =>
  request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () =>
  request('/api/auth/logout', { method: 'POST' });

// Build query so "through end date" is end of that day in user's local timezone
export const getEvents = (params) => {
  const { from, to, ...rest } = params;
  const sp = new URLSearchParams(rest);
  if (from && to) {
    const [yFrom, mFrom, dFrom] = from.split('-').map(Number);
    const [yTo, mTo, dTo] = to.split('-').map(Number);
    const fromDate = new Date(yFrom, mFrom - 1, dFrom);
    const toDateEnd = new Date(yTo, mTo - 1, dTo, 23, 59, 59, 999);
    sp.set('fromDate', fromDate.toISOString());
    sp.set('toDateEnd', toDateEnd.toISOString());
  } else {
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
  }
  const q = sp.toString();
  return request(`/api/calendar/events${q ? `?${q}` : ''}`);
};
// Sync uses timeMin/timeMax; Google's timeMax is exclusive, so use start of (to+1) day so last day is included
export const syncCalendar = (params) => {
  if (!params?.from || !params?.to) {
    return request('/api/calendar/sync', { method: 'POST' });
  }
  const [yFrom, mFrom, dFrom] = params.from.split('-').map(Number);
  const [yTo, mTo, dTo] = params.to.split('-').map(Number);
  const fromDate = new Date(yFrom, mFrom - 1, dFrom);
  const timeMaxExclusive = new Date(yTo, mTo - 1, dTo + 1); // start of next day so 3/10 is fully included
  return request('/api/calendar/sync', {
    method: 'POST',
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      fromDate: fromDate.toISOString(),
      toDateEnd: timeMaxExclusive.toISOString(),
    }),
  });
};
export const getCleaningRecords = () => request('/api/cleanings');
export const upsertCleaningRecord = (data) =>
  request('/api/cleanings', { method: 'POST', body: JSON.stringify(data) });
export const getMappings = () => request('/api/mappings');
export const getSquarespaceOrders = () => request('/api/squarespace/orders');
export const syncSquarespaceOrders = () =>
  request('/api/squarespace/sync', { method: 'POST' });
export const getSquareInvoices = () => request('/api/square/invoices');
export const syncSquareInvoices = () =>
  request('/api/square/sync', { method: 'POST' });
export const getSquareLocations = () => request('/api/square/locations');
export const createMapping = (data) =>
  request('/api/mappings', { method: 'POST', body: JSON.stringify(data) });
export const deleteMapping = (id) =>
  request(`/api/mappings/${id}`, { method: 'DELETE' });
export const getInvoiceById = (id) => request(`/api/square/invoices/${id}`);
export const createInvoice = (payload) =>
  request('/api/square/invoices/create', { method: 'POST', body: JSON.stringify(payload) });
export const createInvoiceFromTemplate = (data) =>
  request('/api/square/invoices/from-template', { method: 'POST', body: JSON.stringify(data) });
export const getAnalytics = (params) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/analytics/summary${q ? `?${q}` : ''}`);
};
export const getAnalyticsCustomers = (params) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/analytics/customers${q ? `?${q}` : ''}`);
};
export const getIntegrations = () => request('/api/integrations');
export const updateIntegrations = (data) =>
  request('/api/integrations', { method: 'PATCH', body: JSON.stringify(data) });
