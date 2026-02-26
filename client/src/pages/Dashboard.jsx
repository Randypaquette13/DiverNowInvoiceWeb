import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getEvents,
  getCleaningRecords,
  getMappings,
  getSquareInvoices,
  syncCalendar,
  upsertCleaningRecord,
  createInvoiceFromTemplate,
  createMapping,
} from '../api';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [linkEventId, setLinkEventId] = useState(null);
  const [customInvoiceEventId, setCustomInvoiceEventId] = useState(null);
  const [extraWorkItems, setExtraWorkItems] = useState([]); // [{ title, value }, ...] for Add extra work modal
  const [sendInvoiceEventId, setSendInvoiceEventId] = useState(null);
  const [addExtraWorkEventId, setAddExtraWorkEventId] = useState(null);

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', from, to],
    queryFn: () => getEvents({ from, to }),
  });

  const { data: records = [] } = useQuery({
    queryKey: ['cleanings'],
    queryFn: getCleaningRecords,
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ['mappings'],
    queryFn: getMappings,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['square-invoices'],
    queryFn: getSquareInvoices,
  });

  const syncMutation = useMutation({
    mutationFn: syncCalendar,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const recordsByEvent = Object.fromEntries(records.map((r) => [r.calendar_event_id, r]));
  const mappingByEvent = Object.fromEntries(mappings.map((m) => [m.calendar_event_id, m]));

  const updateRecordMutation = useMutation({
    mutationFn: upsertCleaningRecord,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cleanings'] }),
  });

  const fromTemplateMutation = useMutation({
    mutationFn: createInvoiceFromTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleanings'] });
      queryClient.invalidateQueries({ queryKey: ['square-invoices'] });
      setSendInvoiceEventId(null);
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: createMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mappings'] });
      setLinkEventId(null);
    },
  });

  function handleYesNo(eventId, status, notes = '', extraWork = '') {
    updateRecordMutation.mutate({
      calendar_event_id: eventId,
      status,
      notes,
      extra_work: extraWork,
    });
  }

  function handleSendInvoice(evId) {
    const items = parseExtraWorkItems(recordsByEvent[evId]?.extra_work);
    fromTemplateMutation.mutate({
      calendar_event_id: evId,
      extra_work_items: items.length > 0 ? items : undefined,
    });
  }

  function handleLinkSubmit(invoiceId) {
    if (!linkEventId || !invoiceId) return;
    createMappingMutation.mutate({ calendar_event_id: linkEventId, order_id: invoiceId });
  }

  // Parse stored extra_work: JSON array of { title, value } or legacy "Title|Value" single item
  function parseExtraWorkItems(extraWork) {
    if (!extraWork || !extraWork.trim()) return [];
    const s = extraWork.trim();
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s);
        if (!Array.isArray(arr)) return [];
        return arr.map((item) => ({
          title: String(item?.title ?? '').trim(),
          value: item?.value != null && item?.value !== '' ? String(item.value) : '',
        })).filter((item) => item.title || item.value);
      } catch {
        return [];
      }
    }
    const pipe = s.indexOf('|');
    if (pipe === -1) return s ? [{ title: s, value: '' }] : [];
    return [{ title: s.slice(0, pipe).trim(), value: s.slice(pipe + 1).trim() }];
  }

  function handleSaveExtraWork(evId, items) {
    const record = recordsByEvent[evId];
    const filtered = items.filter((i) => (i.title && i.title.trim()) || (i.value !== '' && i.value != null));
    const extraWorkStr = filtered.length > 0 ? JSON.stringify(filtered.map((i) => ({ title: (i.title || '').trim(), value: String(i.value ?? '') }))) : undefined;
    updateRecordMutation.mutate({
      calendar_event_id: evId,
      status: record?.status || 'yes',
      notes: record?.notes || '',
      extra_work: extraWorkStr,
    });
    setAddExtraWorkEventId(null);
  }

  function formatDollars(value) {
    if (value == null || value === '') return '—';
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (Number.isNaN(num)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
  }

  function formatCentsToDollars(cents) {
    if (cents == null) return '—';
    return formatDollars(Number(cents) / 100);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Dashboard</h1>
      <div className="flex gap-4 items-center mb-6">
        <label className="text-sm text-gray-600">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1"
        />
        <label className="text-sm text-gray-600">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1"
        />
        <a
          href="/api/auth/google"
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          Connect Google Calendar
        </a>
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          {syncMutation.isPending ? 'Syncing...' : 'Refresh calendar'}
        </button>
      </div>
      {eventsLoading ? (
        <p className="text-gray-500">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No events in this range. Connect Google Calendar or adjust dates.</p>
      ) : (
        <ul className="space-y-4">
          {events.map((ev) => {
            const record = recordsByEvent[ev.id];
            const mapping = mappingByEvent[ev.id];
            const linkedInvoice = mapping && invoices.find((i) => i.external_order_id === mapping.order_id);
            const isPending = !record || record.status === 'pending';
            const isYes = record?.status === 'yes';
            const extraWorkLineItems = parseExtraWorkItems(record?.extra_work);
            return (
              <li
                key={ev.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
              >
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{ev.title || 'Untitled'}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(ev.start_at).toLocaleString()}
                    </p>
                    {linkedInvoice && (
                      <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-md max-w-sm">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Invoice Preview</p>
                        {(linkedInvoice.customer_name || linkedInvoice.customer_email) && (
                          <p className="text-sm text-slate-700 mb-2">
                            {linkedInvoice.customer_name && <span className="font-medium">{linkedInvoice.customer_name}</span>}
                            {linkedInvoice.customer_name && linkedInvoice.customer_email && ' · '}
                            {linkedInvoice.customer_email && <span className="text-slate-600">{linkedInvoice.customer_email}</span>}
                          </p>
                        )}
                        {linkedInvoice.sales_line_items?.length > 0 ? (
                          <ul className="text-sm text-slate-700 space-y-1 mb-2">
                            {linkedInvoice.sales_line_items.map((item, i) => (
                              <li key={i} className="flex justify-between gap-3">
                                <span>
                                  {item.name}
                                  {item.quantity && Number(item.quantity) !== 1 ? ` × ${item.quantity}` : ''}
                                </span>
                                <span className="tabular-nums text-slate-900">
                                  {item.total_money?.amount != null
                                    ? formatCentsToDollars(item.total_money.amount)
                                    : '—'}
                                </span>
                              </li>
                            ))}
                            {extraWorkLineItems.map((item, idx) => (
                              <li key={idx} className="flex justify-between gap-3 text-emerald-700">
                                <span>{item.title || 'Extra'}</span>
                                <span className="tabular-nums">
                                  {item.value ? formatDollars(item.value) : '—'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <>
                            {linkedInvoice.line_items_summary && (
                              <p className="text-sm text-slate-600 mb-2">{linkedInvoice.line_items_summary}</p>
                            )}
                            {extraWorkLineItems.length > 0 && (
                              <ul className="text-sm text-slate-700 space-y-1 mb-2">
                                {extraWorkLineItems.map((item, idx) => (
                                  <li key={idx} className="flex justify-between gap-3 text-emerald-700">
                                    <span>{item.title || 'Extra'}</span>
                                    <span className="tabular-nums">
                                      {item.value ? formatDollars(item.value) : '—'}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                        <p className="text-sm font-semibold text-slate-900 border-t border-slate-200 pt-2 flex justify-between">
                          <span>Total</span>
                          <span className="tabular-nums">
                            {formatDollars(
                              (parseFloat(linkedInvoice.amount) || 0) +
                              extraWorkLineItems.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0)
                            )}
                          </span>
                        </p>
                      </div>
                    )}
                    {record?.notes && (
                      <p className="text-sm text-gray-600 mt-1">Notes: {record.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {isPending ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleYesNo(ev.id, 'yes')}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Job Completed
                        </button>
                        <button
                          type="button"
                          onClick={() => handleYesNo(ev.id, 'no')}
                          className="px-3 py-1.5 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                        >
                          Skipped
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={`px-3 py-1 rounded text-sm ${
                            record.status === 'yes'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {record.status}
                        </span>
                        {isYes && (
                          <>
                            {mapping ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddExtraWorkEventId(ev.id);
                                    setExtraWorkItems(parseExtraWorkItems(recordsByEvent[ev.id]?.extra_work).length > 0
                                      ? parseExtraWorkItems(recordsByEvent[ev.id]?.extra_work)
                                      : [{ title: '', value: '' }]);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
                                >
                                  Add extra work
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSendInvoiceEventId(ev.id)}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                >
                                  Send invoice
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setLinkEventId(ev.id)}
                                  className="px-3 py-1.5 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
                                >
                                  Link invoice
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCustomInvoiceEventId(ev.id)}
                                  className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                                >
                                  Create custom invoice
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {linkEventId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20" onClick={() => setLinkEventId(null)}>
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">Link invoice to event</h3>
            <p className="text-sm text-gray-600 mb-4">Choose a Square invoice to use as template for this event.</p>
            <select
              className="w-full border rounded px-3 py-2 mb-4"
              onChange={(e) => {
                const v = e.target.value;
                if (v) handleLinkSubmit(v);
              }}
            >
              <option value="">Select invoice...</option>
              {invoices.map((inv) => (
                <option key={inv.external_order_id} value={inv.external_order_id}>
                  {inv.customer_email} – {inv.amount}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setLinkEventId(null)} className="text-gray-600 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {addExtraWorkEventId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20" onClick={() => setAddExtraWorkEventId(null)}>
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">Add extra work</h3>
            <p className="text-sm text-gray-600 mb-4">Add one or more line items (e.g. Adding a Zinc). They will appear on the invoice preview and when you send the invoice.</p>
            <div className="space-y-3 mb-4">
              {extraWorkItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.title}
                    onChange={(e) => {
                      const next = [...extraWorkItems];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setExtraWorkItems(next);
                    }}
                    className="flex-1 border rounded px-3 py-2 min-w-0"
                  />
                  <input
                    type="number"
                    placeholder="Price"
                    value={item.value}
                    onChange={(e) => {
                      const next = [...extraWorkItems];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setExtraWorkItems(next);
                    }}
                    className="w-24 border rounded px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraWorkItems(extraWorkItems.filter((_, i) => i !== idx))}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Remove line"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExtraWorkItems([...extraWorkItems, { title: '', value: '' }])}
              className="text-sm text-emerald-600 hover:text-emerald-700 mb-4"
            >
              + Add line item
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSaveExtraWork(addExtraWorkEventId, extraWorkItems)}
                disabled={updateRecordMutation.isPending}
                className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                {updateRecordMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setAddExtraWorkEventId(null)} className="px-4 py-2 text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {sendInvoiceEventId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20" onClick={() => setSendInvoiceEventId(null)}>
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">Send invoice</h3>
            <p className="text-sm text-gray-600 mb-4">Create and send the invoice using the linked template and any extra work line items you added.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSendInvoice(sendInvoiceEventId)}
                disabled={fromTemplateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {fromTemplateMutation.isPending ? 'Creating...' : 'Create invoice'}
              </button>
              <button type="button" onClick={() => setSendInvoiceEventId(null)} className="px-4 py-2 text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {customInvoiceEventId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20" onClick={() => setCustomInvoiceEventId(null)}>
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-2">Create custom invoice</h3>
            <p className="text-sm text-gray-600 mb-4">Go to the Associate page to create a custom invoice and link it to this event.</p>
            <button type="button" onClick={() => setCustomInvoiceEventId(null)} className="mt-4 text-gray-600 text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
