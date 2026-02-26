import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

const SQUARE_VERSION = '2024-01-18';

function getSquareBaseUrl() {
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

async function getSquareCreds(userId) {
  const { rows } = await pool.query(
    'SELECT square_access_token, square_location_id FROM user_integrations WHERE user_id = $1',
    [userId]
  );
  const token = rows[0]?.square_access_token || process.env.SQUARE_ACCESS_TOKEN;
  const locationId = rows[0]?.square_location_id || process.env.SQUARE_LOCATION_ID;
  return { token, locationId };
}

function squareFetch(userId, path, options = {}) {
  return getSquareCreds(userId).then(({ token }) => {
    if (!token) return Promise.reject(new Error('Square not configured'));
    const base = getSquareBaseUrl();
    return fetch(`${base}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
        ...options.headers,
      },
    });
  });
}

function formatLineItemsSummary(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return '';
  return lineItems
    .map((item) => {
      const total = item.total_money?.amount ?? item.base_price_money?.amount;
      const cents = total != null ? (Number(total) / 100).toFixed(2) : '';
      const desc = item.name ?? 'Line item';
      return cents ? `${desc}: ${cents}` : desc;
    })
    .join('; ');
}

function orderToAmount(order) {
  const total = order.total_money ?? order.net_amounts?.total_money;
  if (!total || total.amount == null) return '0';
  return String(Number(total.amount) / 100);
}

function invoiceToAmount(invoice) {
  if (invoice.next_payment_amount_money?.amount != null) {
    return String(Number(invoice.next_payment_amount_money.amount) / 100);
  }
  const requests = invoice.payment_requests || [];
  let totalCents = 0;
  for (const pr of requests) {
    const amt = pr.computed_amount_money?.amount ?? pr.fixed_amount_requested_money?.amount;
    if (amt != null) totalCents += Number(amt);
  }
  return totalCents ? String(totalCents / 100) : '0';
}

function invoiceToCustomerEmail(invoice) {
  return invoice.primary_recipient?.email_address ?? '';
}

export const squareRouter = Router();
squareRouter.use(requireAuth);

// Sync: load invoices from Square Invoices API (GET /v2/invoices), upsert into square_orders
squareRouter.post('/sync', async (req, res) => {
  const userId = req.session.userId;
  const { token, locationId } = await getSquareCreds(userId);
  if (!token || !locationId) {
    return res.status(400).json({ error: 'Square access token and location ID required' });
  }
  const base = getSquareBaseUrl();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Square-Version': SQUARE_VERSION,
  };
  let cursor = null;
  const allInvoices = [];
  for (;;) {
    const params = new URLSearchParams({ location_id: locationId, limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(`${base}/v2/invoices?${params}`, { headers });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Square API error', detail: text });
    }
    const data = await response.json();
    if (data.errors?.length) {
      return res.status(400).json({ error: 'Square API error', detail: data.errors });
    }
    const invoices = data.invoices || [];
    allInvoices.push(...invoices);
    cursor = data.cursor || null;
    if (!cursor) break;
  }
  for (const inv of allInvoices) {
    if (!inv.id) continue;
    const amount = invoiceToAmount(inv);
    const customerEmail = invoiceToCustomerEmail(inv);
    let summary = inv.title ? `${inv.title}` : '';
    let invToStore = { ...inv };
    if (inv.order_id) {
      const orderRes = await fetch(`${base}/v2/orders/${inv.order_id}`, { headers });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        const order = orderData.order;
        if (order?.line_items?.length) {
          invToStore.line_items = order.line_items;
          summary = order.line_items.map((li) => li.name || 'Line item').join('; ') || summary;
        }
      }
    }
    await pool.query(
      `INSERT INTO square_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, external_order_id) DO UPDATE SET
         customer_email = EXCLUDED.customer_email, amount = EXCLUDED.amount,
         line_items_summary = EXCLUDED.line_items_summary, raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
      [userId, invToStore.id, customerEmail, amount, summary, JSON.stringify(invToStore)]
    );
  }
  res.json({ synced: allInvoices.length });
});

squareRouter.get('/invoices', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, user_id, external_order_id, customer_email, amount, line_items_summary, synced_at, raw_json
     FROM square_orders WHERE user_id = $1 ORDER BY synced_at DESC`,
    [userId]
  );
  const list = rows.map((r) => {
    const recipient = r.raw_json?.primary_recipient;
    const customerName = [recipient?.given_name, recipient?.family_name].filter(Boolean).join(' ') || null;
    const out = {
      id: r.id,
      user_id: r.user_id,
      external_order_id: r.external_order_id,
      customer_email: r.customer_email,
      customer_name: customerName,
      amount: r.amount,
      line_items_summary: r.line_items_summary,
      synced_at: r.synced_at,
    };
    if (r.raw_json?.line_items?.length) {
      out.sales_line_items = r.raw_json.line_items.map((li) => ({
        name: li.name || 'Line item',
        total_money: li.total_money ?? li.variation_total_price_money ?? li.base_price_money,
        quantity: li.quantity ?? '1',
      }));
    } else if (r.raw_json?.payment_requests?.length) {
      out.sales_line_items = r.raw_json.payment_requests.map((pr) => ({
        name: pr.request_type === 'BALANCE' ? 'Balance' : pr.request_type || 'Payment',
        total_money: pr.computed_amount_money ?? pr.fixed_amount_requested_money,
        quantity: '1',
      }));
    }
    return out;
  });
  res.json(list);
});

squareRouter.get('/invoices/:id', async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;
  const { rows } = await pool.query(
    'SELECT * FROM square_orders WHERE user_id = $1 AND external_order_id = $2',
    [userId, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  const raw = rows[0].raw_json || {};
  res.json(raw);
});

// List locations (for Settings: pick location_id)
squareRouter.get('/locations', async (req, res) => {
  const userId = req.session.userId;
  const response = await squareFetch(userId, '/v2/locations');
  if (!response.ok) {
    const text = await response.text();
    return res.status(response.status).json({ error: 'Square API error', detail: text });
  }
  const data = await response.json();
  if (data.errors?.length) {
    return res.status(400).json({ error: 'Square API error', detail: data.errors });
  }
  const locations = (data.locations || []).map((loc) => ({
    id: loc.id,
    name: loc.name,
    business_name: loc.business_name,
  }));
  res.json(locations);
});

// Create invoice (custom): create Order via Orders API, then Create Invoice via Invoices API
squareRouter.post('/invoices/create', async (req, res) => {
  const userId = req.session.userId;
  const { token, locationId } = await getSquareCreds(userId);
  if (!token || !locationId) {
    return res.status(400).json({ error: 'Square access token and location ID required' });
  }
  const payload = req.body;
  const amountCents = Math.round(Number(payload.amount ?? 0) * 100);
  const title = payload.title || 'Boat Cleaning';
  const base = getSquareBaseUrl();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_VERSION,
  };

  // 1) Create order (Orders API)
  const orderPayload = {
    location_id: locationId,
    reference_id: payload.externalOrderReference || `divernow-custom-${Date.now()}`,
    line_items: [
      { name: title, quantity: '1', base_price_money: { amount: amountCents, currency: 'USD' } },
    ],
  };
  const orderRes = await fetch(`${base}/v2/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      order: orderPayload,
      idempotency_key: `divernow-order-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
  });
  if (!orderRes.ok) {
    const data = await orderRes.json().catch(() => ({}));
    const detail = data.errors?.[0]?.detail || data.message || await orderRes.text();
    return res.status(orderRes.status).json({ error: 'Create invoice failed', detail });
  }
  const orderData = await orderRes.json();
  const order = orderData.order;
  if (!order?.id) {
    return res.status(502).json({ error: 'Square did not return an order' });
  }

  // 2) Create invoice (Invoices API) for this order
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);
  const invoicePayload = {
    location_id: locationId,
    order_id: order.id,
    payment_requests: [
      { request_type: 'BALANCE', due_date: dueDateStr },
    ],
    delivery_method: 'SHARE_MANUALLY',
    accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false, cash_app_pay: false },
    title: title,
  };
  const invRes = await fetch(`${base}/v2/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoice: invoicePayload,
      idempotency_key: `divernow-inv-${userId}-${order.id}`,
    }),
  });
  if (!invRes.ok) {
    const data = await invRes.json().catch(() => ({}));
    const detail = data.errors?.[0]?.detail || data.message || await invRes.text();
    return res.status(invRes.status).json({ error: 'Create invoice failed', detail });
  }
  const invData = await invRes.json();
  const invoice = invData.invoice;
  if (!invoice?.id) {
    return res.status(502).json({ error: 'Square did not return an invoice' });
  }

  const amount = invoiceToAmount(invoice);
  const customerEmail = payload.customerEmail || invoiceToCustomerEmail(invoice);
  await pool.query(
    `INSERT INTO square_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, external_order_id) DO UPDATE SET raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
    [userId, invoice.id, customerEmail, amount, title, JSON.stringify(invoice)]
  );
  res.status(201).json(invoice);
});

// Create invoice from template (existing invoice linked to event): fetch template's order from Square, create new order + invoice
squareRouter.post('/invoices/from-template', async (req, res) => {
  const userId = req.session.userId;
  const { calendar_event_id, extra_work_title, extra_work_value, extra_work_items } = req.body;
  if (!calendar_event_id) return res.status(400).json({ error: 'calendar_event_id required' });
  const { rows: mappingRows } = await pool.query(
    'SELECT square_order_id FROM event_invoice_mappings WHERE user_id = $1 AND calendar_event_id = $2 AND square_order_id IS NOT NULL',
    [userId, calendar_event_id]
  );
  const mapping = mappingRows[0];
  if (!mapping) return res.status(400).json({ error: 'No invoice associated with this event. Link an invoice first.' });
  const { rows: templateRows } = await pool.query(
    'SELECT raw_json FROM square_orders WHERE user_id = $1 AND external_order_id = $2',
    [userId, mapping.square_order_id]
  );
  const templateInvoice = templateRows[0]?.raw_json;
  if (!templateInvoice) return res.status(404).json({ error: 'Template invoice not found' });
  const { token, locationId } = await getSquareCreds(userId);
  if (!token || !locationId) return res.status(400).json({ error: 'Square not configured' });

  const base = getSquareBaseUrl();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Square-Version': SQUARE_VERSION,
  };

  let totalCents = 0;
  let lineItems = [];
  const templateOrderId = templateInvoice.order_id;
  if (templateOrderId) {
    const orderRes = await fetch(`${base}/v2/orders/${templateOrderId}`, { headers });
    if (orderRes.ok) {
      const orderData = await orderRes.json();
      const templateOrder = orderData.order;
      if (templateOrder?.line_items?.length) {
        lineItems = templateOrder.line_items.map((li) => ({
          name: li.name || 'Line item',
          quantity: li.quantity || '1',
          base_price_money: li.base_price_money ?? { amount: 0, currency: 'USD' },
        }));
      }
      totalCents = Number(templateOrder?.total_money?.amount ?? 0);
    }
  }
  if (lineItems.length === 0) {
    totalCents = totalCents || Math.round(Number(invoiceToAmount(templateInvoice)) * 100);
    lineItems = [{ name: 'Boat Cleaning', quantity: '1', base_price_money: { amount: totalCents, currency: 'USD' } }];
  }
  const extraItems = Array.isArray(extra_work_items) && extra_work_items.length > 0
    ? extra_work_items
    : extra_work_title && extra_work_value != null
      ? [{ title: extra_work_title, value: extra_work_value }]
      : [];
  for (const item of extraItems) {
    const title = item?.title?.trim?.();
    const value = item?.value;
    if (!title || value == null || value === '') continue;
    const extraCents = Math.round(Number(value) * 100);
    lineItems.push({
      name: title,
      quantity: '1',
      base_price_money: { amount: extraCents, currency: 'USD' },
    });
    totalCents += extraCents;
  }

  const orderPayload = {
    location_id: locationId,
    reference_id: `divernow-${calendar_event_id}-${Date.now()}`,
    line_items: lineItems,
  };
  const orderRes = await fetch(`${base}/v2/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      order: orderPayload,
      idempotency_key: `divernow-${userId}-${calendar_event_id}-${Date.now()}`,
    }),
  });
  if (!orderRes.ok) {
    const data = await orderRes.json().catch(() => ({}));
    const detail = data.errors?.[0]?.detail || await orderRes.text();
    return res.status(orderRes.status).json({ error: 'Create invoice failed', detail });
  }
  const orderData = await orderRes.json();
  const order = orderData.order;
  if (!order?.id) return res.status(502).json({ error: 'Square did not return an order' });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);
  const invoicePayload = {
    location_id: locationId,
    order_id: order.id,
    payment_requests: [{ request_type: 'BALANCE', due_date: dueDateStr }],
    delivery_method: 'SHARE_MANUALLY',
    accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: false, cash_app_pay: false },
    title: 'Boat Cleaning',
  };
  const invRes = await fetch(`${base}/v2/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoice: invoicePayload,
      idempotency_key: `divernow-inv-tpl-${userId}-${order.id}`,
    }),
  });
  if (!invRes.ok) {
    const data = await invRes.json().catch(() => ({}));
    const detail = data.errors?.[0]?.detail || await invRes.text();
    return res.status(invRes.status).json({ error: 'Create invoice failed', detail });
  }
  const invData = await invRes.json();
  const invoice = invData.invoice;
  if (!invoice?.id) return res.status(502).json({ error: 'Square did not return an invoice' });

  const amount = invoiceToAmount(invoice);
  const customerEmail = invoiceToCustomerEmail(templateInvoice);
  await pool.query(
    'UPDATE cleaning_records SET square_order_id = $2, updated_at = NOW() WHERE user_id = $1 AND calendar_event_id = $3',
    [userId, invoice.id, calendar_event_id]
  );
  await pool.query(
    `INSERT INTO square_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, external_order_id) DO UPDATE SET raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
    [userId, invoice.id, customerEmail, amount, invoice.title || 'Boat Cleaning', JSON.stringify(invoice)]
  );
  res.status(201).json(invoice);
});
