import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEvents,
  getSquareInvoices,
  getMappings,
  syncSquareInvoices,
  createMapping,
  createInvoice,
} from '../api';

const CREATE_CUSTOM_VALUE = '__create_custom__';

export default function Associate() {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [syncError, setSyncError] = useState('');
  const [customInvoiceEventId, setCustomInvoiceEventId] = useState(null);
  const [createInvoiceError, setCreateInvoiceError] = useState('');
  const [customTitle, setCustomTitle] = useState('Boat Cleaning');
  const [customAmount, setCustomAmount] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: events = [] } = useQuery({
    queryKey: ['events', from, to],
    queryFn: () => getEvents({ from, to }),
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ['square-invoices'],
    queryFn: getSquareInvoices,
  });
  const { data: mappings = [] } = useQuery({
    queryKey: ['mappings'],
    queryFn: getMappings,
  });

  const syncMutation = useMutation({
    mutationFn: syncSquareInvoices,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-invoices'] });
      setSyncError('');
    },
    onError: (err) => {
      setSyncError(err.body?.detail || err.body?.error || err.message || 'Sync failed');
    },
  });

  const mappingByEvent = Object.fromEntries(
    mappings.map((m) => [m.calendar_event_id, m])
  );
  const mappedInvoiceIds = new Set(mappings.map((m) => m.order_id));

  const createMappingMutation = useMutation({
    mutationFn: createMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
      setSelectedEventId('');
      setSelectedInvoiceId('');
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: ({ payload, eventId }) =>
      createInvoice(payload).then((invoice) => ({ invoice, eventId })),
    onSuccess: ({ invoice, eventId }) => {
      const invoiceId = invoice?.id ?? invoice?.orderId;
      if (eventId && invoiceId) {
        createMappingMutation.mutate({
          calendar_event_id: Number(eventId),
          order_id: invoiceId,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['square-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
      setCustomInvoiceEventId(null);
      setCreateInvoiceError('');
      setCustomTitle('Boat Cleaning');
      setCustomAmount('');
      setCustomEmail('');
    },
    onError: (err) => {
      let msg = err?.body?.error || err?.message || 'Create invoice failed';
      try {
        const d = typeof err?.body?.detail === 'string' ? JSON.parse(err.body.detail) : err?.body?.detail;
        if (d?.message) msg = d.message;
      } catch {}
      setCreateInvoiceError(msg);
    },
  });

  function handleLink() {
    if (!selectedEventId || !selectedInvoiceId || selectedInvoiceId === CREATE_CUSTOM_VALUE) return;
    createMappingMutation.mutate({
      calendar_event_id: Number(selectedEventId),
      order_id: selectedInvoiceId,
    });
  }

  function handleInvoiceChange(value) {
    setSelectedInvoiceId(value);
    if (value === CREATE_CUSTOM_VALUE) {
      setCustomInvoiceEventId(selectedEventId || null);
      setCreateInvoiceError('');
    }
  }

  function closeCustomInvoiceModal() {
    setCustomInvoiceEventId(null);
    setCreateInvoiceError('');
  }

  function handleCreateCustomInvoice(e) {
    e.preventDefault();
    const amount = (customAmount && Number(customAmount)) || 0;
    const payload = {
      title: customTitle || 'Boat Cleaning',
      amount,
      customerEmail: customEmail || undefined,
    };
    const eventId = customInvoiceEventId ?? (selectedEventId || null);
    createInvoiceMutation.mutate({ payload, eventId });
  }

  function formatSalesLineItems(salesLineItems) {
    if (!Array.isArray(salesLineItems) || salesLineItems.length === 0) return null;
    return salesLineItems.map((item, i) => {
      const cents = item.total_money?.amount ?? item.base_price_money?.amount;
      const dollars = cents != null ? (Number(cents) / 100).toFixed(2) : '';
      const desc = item.name ?? `Item ${i + 1}`;
      return dollars ? `${desc}: $${dollars}` : desc;
    }).join('; ');
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Invoice–Event association</h1>
      <p className="text-gray-600 mb-4">
        Load invoices from Square and link them to calendar events so the dashboard can prepopulate the Send invoice form.
      </p>
      <button
        type="button"
        onClick={() => {
          setSyncError('');
          syncMutation.mutate();
        }}
        disabled={syncMutation.isPending}
        className="mb-6 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
      >
        {syncMutation.isPending ? 'Loading...' : 'Load invoices from Square'}
      </button>
      {syncError && (
        <p className="mb-4 text-sm text-red-600" role="alert">{syncError}</p>
      )}

      <div className="bg-white border rounded-lg p-4 mb-6 max-w-lg">
        <h2 className="font-medium text-gray-900 mb-3">Link event to invoice</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="">Select event...</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title || 'Untitled'} ({new Date(ev.start_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="">Select invoice...</option>
              {invoices.map((inv) => (
                <option key={inv.external_order_id} value={inv.external_order_id}>
                  {inv.customer_email || '—'} · Total: ${inv.amount}
                  {inv.line_items_summary ? ` · ${inv.line_items_summary}` : ''}
                </option>
              ))}
              <option value={CREATE_CUSTOM_VALUE}>Create custom invoice</option>
            </select>
          </div>
        </div>
        {selectedInvoiceId && selectedInvoiceId !== CREATE_CUSTOM_VALUE && (
          <button
            type="button"
            onClick={handleLink}
            disabled={createMappingMutation.isPending}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {createMappingMutation.isPending ? 'Linking...' : 'Link'}
          </button>
        )}
      </div>

      <div className="bg-white border rounded-lg p-4 mb-6 max-w-2xl">
        <h2 className="font-medium text-gray-900 mb-3">Events and linked invoices</h2>
        <ul className="space-y-2">
          {events.map((ev) => {
            const mapping = mappingByEvent[ev.id];
            const invoice = mapping && invoices.find((i) => i.external_order_id === mapping.order_id);
            return (
              <li key={ev.id} className="p-3 bg-gray-50 rounded flex justify-between items-center">
                <span>{ev.title || 'Untitled'} ({new Date(ev.start_at).toLocaleDateString()})</span>
                {invoice ? (
                  <span className="text-sm text-gray-600">
                    Total: ${invoice.amount}
                    {invoice.sales_line_items?.length > 0 && (
                      <span className="ml-2">· {formatSalesLineItems(invoice.sales_line_items)}</span>
                    )}
                    {!invoice.sales_line_items?.length && invoice.line_items_summary && (
                      <span className="ml-2">· {invoice.line_items_summary}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">Not linked</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="bg-white border rounded-lg p-4 max-w-2xl">
        <h2 className="font-medium text-gray-900 mb-3">All invoices (total and line items)</h2>
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li
              key={inv.external_order_id}
              className="p-3 bg-white border rounded flex justify-between items-center"
            >
              <div>
                <span className="font-medium">{inv.customer_email || 'No email'}</span>
                <span className="ml-2 text-gray-600">Total: ${inv.amount}</span>
              </div>
              <div className="text-sm text-gray-600">
                {inv.sales_line_items?.length > 0
                  ? formatSalesLineItems(inv.sales_line_items)
                  : inv.line_items_summary || '—'}
              </div>
              {mappedInvoiceIds.has(inv.external_order_id) && (
                <span className="text-green-600 text-sm">Linked</span>
              )}
            </li>
          ))}
          {invoices.length === 0 && (
            <li className="text-sm text-gray-500">
              No invoices yet. Add your Square access token and location in Settings and click Load invoices from Square.
            </li>
          )}
        </ul>
      </div>

      {customInvoiceEventId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20" onClick={closeCustomInvoiceModal}>
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">Create custom invoice</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create an invoice and link it to the selected event. Enter at least a title and amount.
            </p>
            {createInvoiceError && (
              <p className="mb-4 text-sm text-red-600" role="alert">{createInvoiceError}</p>
            )}
            <form onSubmit={handleCreateCustomInvoice}>
              <label className="block text-sm text-gray-700 mb-1">Customer email (optional)</label>
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
                placeholder="customer@example.com"
              />
              <label className="block text-sm text-gray-700 mb-1">Line item title</label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
                placeholder="Boat Cleaning"
              />
              <label className="block text-sm text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                required
                className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
                placeholder="0.00"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createInvoiceMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {createInvoiceMutation.isPending ? 'Creating...' : 'Create and link'}
                </button>
                <button type="button" onClick={closeCustomInvoiceModal} className="px-4 py-2 text-gray-600">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
