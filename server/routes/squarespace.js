import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import pool from '../db/pool.js';

export const squarespaceRouter = Router();
squarespaceRouter.use(requireAuth);

async function getApiKey(userId) {
  const { rows } = await pool.query(
    'SELECT squarespace_api_key FROM user_integrations WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.squarespace_api_key || process.env.SQUARESPACE_API_KEY;
}

function formatLineItemsSummary(salesLineItems) {
  if (!Array.isArray(salesLineItems) || salesLineItems.length === 0) {
    return '';
  }
  return salesLineItems
    .map((item) => {
      const total = item.total?.value ?? item.totalNetSales?.value ?? item.totalSales?.value;
      const desc = item.description ?? '';
      return total != null ? `${desc || 'Line item'}: ${total}` : (desc || 'Line item');
    })
    .join('; ');
}

// Sync from Transactions API: group by customer email, one per price point; upsert into squarespace_orders.
squarespaceRouter.post('/sync', async (req, res) => {
  const userId = req.session.userId;
  const apiKey = await getApiKey(userId);
  if (!apiKey) {
    return res.status(400).json({ error: 'Squarespace API key not configured' });
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'User-Agent': 'DiverNowAdmin/1.0',
  };
  const modifiedAfter = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const modifiedBefore = new Date().toISOString();
  let allDocs = [];
  let url = `https://api.squarespace.com/1.0/commerce/transactions?modifiedAfter=${encodeURIComponent(modifiedAfter)}&modifiedBefore=${encodeURIComponent(modifiedBefore)}`;
  for (;;) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Squarespace API error', detail: text });
    }
    const data = await response.json();
    const page = data.documents || [];
    allDocs = allDocs.concat(page);
    const pagination = data.pagination || {};
    if (!pagination.hasNextPage || !pagination.nextPageCursor) break;
    url = `https://api.squarespace.com/1.0/commerce/transactions?cursor=${encodeURIComponent(pagination.nextPageCursor)}`;
  }

  const byCustomerAndPrice = new Map();
  const normEmail = (e) => (e == null || String(e).trim() === '' ? '__no_email__' : String(e).trim().toLowerCase());
  for (const doc of allDocs) {
    if (!doc.salesOrderId) continue;
    const email = normEmail(doc.customerEmail);
    const totalValue = doc.total?.value ?? doc.totalNetPayment?.value ?? '0';
    const priceKey = `${email}|${totalValue}`;
    const existing = byCustomerAndPrice.get(priceKey);
    const docModified = doc.modifiedOn ? new Date(doc.modifiedOn).getTime() : 0;
    if (!existing || (existing.modifiedOn ? new Date(existing.modifiedOn).getTime() : 0) < docModified) {
      byCustomerAndPrice.set(priceKey, doc);
    }
  }

  const toUpsert = [...byCustomerAndPrice.values()];
  for (const doc of toUpsert) {
    const amount = doc.total?.value ?? doc.totalNetPayment?.value ?? '0';
    const summary = formatLineItemsSummary(doc.salesLineItems);
    await pool.query(
      `INSERT INTO squarespace_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, external_order_id) DO UPDATE SET
         customer_email = EXCLUDED.customer_email, amount = EXCLUDED.amount,
         line_items_summary = EXCLUDED.line_items_summary, raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
      [userId, doc.salesOrderId, doc.customerEmail || '', amount, summary, JSON.stringify(doc)]
    );
  }
  res.json({ synced: toUpsert.length });
});

squarespaceRouter.get('/orders', async (req, res) => {
  const userId = req.session.userId;
  const { rows } = await pool.query(
    `SELECT id, user_id, external_order_id, customer_email, amount, line_items_summary, synced_at, raw_json
     FROM squarespace_orders WHERE user_id = $1 ORDER BY synced_at DESC`,
    [userId]
  );
  const list = rows.map((r) => {
    const out = {
      id: r.id,
      user_id: r.user_id,
      external_order_id: r.external_order_id,
      customer_email: r.customer_email,
      amount: r.amount,
      line_items_summary: r.line_items_summary,
      synced_at: r.synced_at,
    };
    if (r.raw_json?.salesLineItems) {
      out.sales_line_items = r.raw_json.salesLineItems;
    }
    return out;
  });
  res.json(list);
});

squarespaceRouter.get('/orders/:id', async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.params;
  const { rows } = await pool.query(
    'SELECT * FROM squarespace_orders WHERE user_id = $1 AND external_order_id = $2',
    [userId, id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  const raw = rows[0].raw_json || rows[0];
  res.json(raw);
});

// Build create-order payload from transaction (raw_json): customerEmail, total, one CUSTOM line "Boat Cleaning", optional extra line.
squarespaceRouter.post('/orders/from-template', async (req, res) => {
  const userId = req.session.userId;
  const { calendar_event_id, extra_work_title, extra_work_value } = req.body;
  if (!calendar_event_id) return res.status(400).json({ error: 'calendar_event_id required' });
  const { rows: mappingRows } = await pool.query(
    'SELECT squarespace_order_id FROM event_invoice_mappings WHERE user_id = $1 AND calendar_event_id = $2',
    [userId, calendar_event_id]
  );
  const mapping = mappingRows[0];
  if (!mapping) return res.status(400).json({ error: 'No invoice associated with this event. Link an invoice first.' });
  const { rows: orderRows } = await pool.query(
    'SELECT raw_json FROM squarespace_orders WHERE user_id = $1 AND external_order_id = $2',
    [userId, mapping.squarespace_order_id]
  );
  const transaction = orderRows[0]?.raw_json;
  if (!transaction) return res.status(404).json({ error: 'Template transaction not found' });
  const apiKey = await getApiKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'Squarespace API key not configured' });

  const total = transaction.total || { currency: 'USD', value: '0' };
  const lineItems = [
    {
      lineItemType: 'CUSTOM',
      title: 'Boat Cleaning',
      quantity: 1,
      unitPricePaid: { currency: total.currency || 'USD', value: String(total.value) },
      nonSaleUnitPrice: { currency: total.currency || 'USD', value: String(total.value) },
    },
  ];
  if (extra_work_title && extra_work_value != null) {
    lineItems.push({
      lineItemType: 'CUSTOM',
      title: extra_work_title,
      quantity: 1,
      unitPricePaid: { currency: total.currency || 'USD', value: String(extra_work_value) },
      nonSaleUnitPrice: { currency: total.currency || 'USD', value: String(extra_work_value) },
    });
  }
  const payload = {
    channelName: 'Diver Now Admin',
    externalOrderReference: `divernow-${calendar_event_id}-${Date.now()}`,
    customerEmail: transaction.customerEmail || '',
    lineItems,
    priceTaxInterpretation: 'EXCLUSIVE',
    subtotal: total,
    shippingTotal: { currency: total.currency || 'USD', value: '0' },
    discountTotal: { currency: total.currency || 'USD', value: '0' },
    taxTotal: { currency: total.currency || 'USD', value: '0' },
    grandTotal: total,
    createdOn: new Date().toISOString(),
  };
  const idempotencyKey = `divernow-${userId}-${calendar_event_id}-${Date.now()}`;
  const response = await fetch('https://api.squarespace.com/1.0/commerce/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'DiverNowAdmin/1.0',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    return res.status(response.status).json({ error: 'Create order failed', detail: text });
  }
  const order = await response.json();
  await pool.query(
    'UPDATE cleaning_records SET squarespace_order_id = $2, updated_at = NOW() WHERE user_id = $1 AND calendar_event_id = $3',
    [userId, order.id, calendar_event_id]
  );
  await pool.query(
    `INSERT INTO squarespace_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, external_order_id) DO UPDATE SET raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
    [userId, order.id, order.customerEmail || '', order.grandTotal?.value ?? '0', '', JSON.stringify(order)]
  );
  res.status(201).json(order);
});

squarespaceRouter.post('/orders/create', async (req, res) => {
  const userId = req.session.userId;
  const apiKey = await getApiKey(userId);
  if (!apiKey) return res.status(400).json({ error: 'Squarespace API key not configured' });
  const payload = req.body;
  const idempotencyKey = `divernow-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await fetch('https://api.squarespace.com/1.0/commerce/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'User-Agent': 'DiverNowAdmin/1.0',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    return res.status(response.status).json({ error: 'Create order failed', detail: text });
  }
  const order = await response.json();
  await pool.query(
    `INSERT INTO squarespace_orders (user_id, external_order_id, customer_email, amount, line_items_summary, raw_json, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, external_order_id) DO UPDATE SET raw_json = EXCLUDED.raw_json, synced_at = NOW()`,
    [userId, order.id, order.customerEmail || '', order.grandTotal?.value ?? '0', '', JSON.stringify(order)]
  );
  res.status(201).json(order);
});
