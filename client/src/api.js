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

export const getEvents = (params) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/calendar/events${q ? `?${q}` : ''}`);
};
export const syncCalendar = () =>
  request('/api/calendar/sync', { method: 'POST' });
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
