import { useState, useEffect, useRef } from 'react';
import { useCalendarRange } from '../context/CalendarRangeContext';
import { useInvoiceSync } from '../context/InvoiceSyncContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getEvents,
  getSquareInvoices,
  getMappings,
  syncCalendar,
  syncSquareInvoices,
  createMapping,
  createInvoice,
} from '../api';

const CREATE_CUSTOM_VALUE = '__create_custom__';

export default function Associate() {
  const queryClient = useQueryClient();
  const { from, setFrom, to, setTo } = useCalendarRange();
  const { invoiceSyncPending, setInvoiceSyncPending } = useInvoiceSync();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [syncError, setSyncError] = useState('');
  const [calendarSyncError, setCalendarSyncError] = useState('');
  const [customInvoiceEventId, setCustomInvoiceEventId] = useState(null);
  const [createInvoiceError, setCreateInvoiceError] = useState('');
  const [customTitle, setCustomTitle] = useState('Boat Cleaning');
  const [customAmount, setCustomAmount] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDropdownOpen, setInvoiceDropdownOpen] = useState(false);
  const invoiceDropdownRef = useRef(null);
  const [eventSearch, setEventSearch] = useState('');
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const eventDropdownRef = useRef(null);

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
    onMutate: () => setInvoiceSyncPending(true),
    onSettled: () => setInvoiceSyncPending(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['square-invoices'] });
      setSyncError('');
    },
    onError: (err) => {
      setSyncError(err.body?.detail || err.body?.error || err.message || 'Sync failed');
    },
  });

  const calendarSyncMutation = useMutation({
    mutationFn: () => syncCalendar({ from, to }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setCalendarSyncError('');
    },
    onError: (err) => {
      setCalendarSyncError(err.body?.error || err.body?.detail || err.message || 'Calendar sync failed');
      if (err.body?.code === 'google_reconnect') {
        queryClient.invalidateQueries({ queryKey: ['integrations'] });
      }
    },
  });

  useEffect(() => {
    calendarSyncMutation.mutate();
  }, [from, to]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (invoiceDropdownRef.current && !invoiceDropdownRef.current.contains(e.target)) {
        setInvoiceDropdownOpen(false);
      }
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target)) {
        setEventDropdownOpen(false);
      }
    }
    if (invoiceDropdownOpen || eventDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [invoiceDropdownOpen, eventDropdownOpen]);

  const mappingByEvent = Object.fromEntries(
    mappings.map((m) => [m.calendar_event_id, m])
  );
  const mappedInvoiceIds = new Set(mappings.map((m) => m.order_id));

  const invoiceSearchLower = invoiceSearch.trim().toLowerCase();
  const filteredInvoices =
    !invoiceSearchLower
      ? invoices
      : invoices.filter(
          (inv) =>
            (inv.title || '').toLowerCase().includes(invoiceSearchLower) ||
            (inv.customer_email || '').toLowerCase().includes(invoiceSearchLower)
        );

  const eventSearchLower = eventSearch.trim().toLowerCase();
  const filteredEvents =
    !eventSearchLower
      ? events
      : events.filter((ev) => {
          const title = (ev.title || 'Untitled').toLowerCase();
          const dateStr = new Date(ev.start_at).toLocaleDateString().toLowerCase();
          return title.includes(eventSearchLower) || dateStr.includes(eventSearchLower);
        });

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
        disabled={syncMutation.isPending || invoiceSyncPending}
        className="mb-6 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
      >
        {syncMutation.isPending || invoiceSyncPending ? 'Loading...' : 'Load invoices from Square'}
      </button>
      {syncError && (
        <p className="mb-4 text-sm text-red-600" role="alert">{syncError}</p>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <span className="text-sm text-gray-600">Calendar event range:</span>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </label>
        {calendarSyncMutation.isPending && (
          <span className="text-sm text-gray-500">Loading events...</span>
        )}
      </div>
      {calendarSyncError && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {calendarSyncError}
          {calendarSyncError.includes('expired') || calendarSyncError.includes('revoked')
            ? ' Connect Google Calendar from the Dashboard first.'
            : ''}
        </p>
      )}

      <div className="bg-white border rounded-lg p-4 mb-6 max-w-5xl">
        <h2 className="font-medium text-gray-900 mb-3">Link event to invoice</h2>
        <div className="grid grid-cols-2 gap-4">
          <div ref={eventDropdownRef} className="relative min-w-0">
            <label className="block text-sm text-gray-600 mb-1">Event</label>
            {eventDropdownOpen ? (
              <input
                type="text"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Type to search by title or date..."
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEventDropdownOpen(false);
                    setEventSearch('');
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEventDropdownOpen(true)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-left flex items-center justify-between gap-2 bg-white"
              >
                <span className="break-words min-w-0 text-left">
                  {!selectedEventId
                    ? 'Select event...'
                    : (() => {
                        const ev = events.find((e) => e.id === Number(selectedEventId));
                        return ev
                          ? `${ev.title || 'Untitled'} (${new Date(ev.start_at).toLocaleDateString()})`
                          : selectedEventId;
                      })()}
                </span>
                <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {eventDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full border border-gray-300 rounded bg-white shadow-lg max-h-72 overflow-y-auto min-w-[16rem]">
                <ul className="py-1">
                  {filteredEvents.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEventId(String(ev.id));
                          setEventDropdownOpen(false);
                          setEventSearch('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 break-words"
                      >
                        {ev.title || 'Untitled'} ({new Date(ev.start_at).toLocaleDateString()})
                      </button>
                    </li>
                  ))}
                </ul>
                {filteredEvents.length === 0 && events.length > 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">No events match your search.</p>
                )}
              </div>
            )}
          </div>
          <div ref={invoiceDropdownRef} className="relative min-w-0">
            <label className="block text-sm text-gray-600 mb-1">Invoice</label>
            {invoiceDropdownOpen ? (
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Type to search by title or email..."
                className="w-full border border-gray-300 rounded px-3 py-2 bg-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setInvoiceDropdownOpen(false);
                    setInvoiceSearch('');
                  }
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setInvoiceDropdownOpen(true)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-left flex items-center justify-between gap-2 bg-white"
              >
                <span className="break-words min-w-0 text-left">
                  {!selectedInvoiceId
                    ? 'Select invoice...'
                    : selectedInvoiceId === CREATE_CUSTOM_VALUE
                      ? 'Create custom invoice'
                      : (() => {
                          const inv = invoices.find((i) => i.external_order_id === selectedInvoiceId);
                          return inv
                            ? `${inv.title || inv.line_items_summary || '—'} · $${inv.amount ?? '—'} · ${inv.customer_email || '—'}`
                            : selectedInvoiceId;
                        })()}
                </span>
                <svg className="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            {invoiceDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full border border-gray-300 rounded bg-white shadow-lg max-h-72 overflow-y-auto min-w-[16rem]">
                <ul className="py-1">
                  {filteredInvoices.map((inv) => (
                    <li key={inv.external_order_id}>
                      <button
                        type="button"
                        onClick={() => {
                          handleInvoiceChange(inv.external_order_id);
                          setInvoiceDropdownOpen(false);
                          setInvoiceSearch('');
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 break-words"
                      >
                        {inv.title || inv.line_items_summary || '—'} · ${inv.amount ?? '—'} · {inv.customer_email || '—'}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        handleInvoiceChange(CREATE_CUSTOM_VALUE);
                        setInvoiceDropdownOpen(false);
                        setInvoiceSearch('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 font-medium text-gray-700"
                    >
                      Create custom invoice
                    </button>
                  </li>
                </ul>
                {filteredInvoices.length === 0 && invoices.length > 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">No invoices match your search.</p>
                )}
              </div>
            )}
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

      <div className="bg-white border rounded-lg p-4 mb-6 max-w-5xl">
        <h2 className="font-medium text-gray-900 mb-3">Events and linked invoices</h2>
        <ul className="space-y-2">
          {events.map((ev) => {
            const mapping = mappingByEvent[ev.id];
            const invoice = mapping && invoices.find((i) => i.external_order_id === mapping.order_id);
            return (
              <li key={ev.id} className="p-3 bg-gray-50 rounded flex justify-between items-center gap-3">
                <span className="break-words min-w-0">{ev.title || 'Untitled'} ({new Date(ev.start_at).toLocaleDateString()})</span>
                {invoice ? (
                  <span className="text-sm text-gray-600 break-words min-w-0 text-right">
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

      <div className="bg-white border rounded-lg p-4 max-w-5xl">
        <h2 className="font-medium text-gray-900 mb-3">All invoices (total and line items)</h2>
        <ul className="space-y-2">
          {filteredInvoices.map((inv) => (
            <li
              key={inv.external_order_id}
              className="p-3 bg-white border rounded flex justify-between items-center gap-3"
            >
              <div className="break-words min-w-0">
                <span className="font-medium">{inv.customer_email || 'No email'}</span>
                <span className="ml-2 text-gray-600">Total: ${inv.amount}</span>
              </div>
              <div className="text-sm text-gray-600 break-words min-w-0 text-right">
                {inv.sales_line_items?.length > 0
                  ? formatSalesLineItems(inv.sales_line_items)
                  : inv.line_items_summary || '—'}
              </div>
              {mappedInvoiceIds.has(inv.external_order_id) && (
                <span className="text-green-600 text-sm">Linked</span>
              )}
            </li>
          ))}
          {filteredInvoices.length === 0 && (
            <li className="text-sm text-gray-500">
              {invoices.length === 0
                ? 'No invoices yet. Add your Square access token and location in Settings and click Load invoices from Square.'
                : 'No invoices match your search.'}
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
