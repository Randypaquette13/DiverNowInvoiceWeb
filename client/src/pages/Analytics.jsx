import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getAnalyticsCustomers } from '../api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function Analytics() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: summary } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => getAnalytics({ from, to }),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['analytics-customers', from, to],
    queryFn: () => getAnalyticsCustomers({ from, to }),
  });

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Analytics</h1>
      <p className="text-gray-600 mb-4">
        Customers are identified by calendar event (event title / boat). Filter by date range.
      </p>
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
      </div>
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded border">
            <p className="text-sm text-gray-500">Total cleanings</p>
            <p className="text-2xl font-semibold">{summary.totalCleanings ?? 0}</p>
          </div>
          <div className="bg-white p-4 rounded border">
            <p className="text-sm text-gray-500">Revenue</p>
            <p className="text-2xl font-semibold">{summary.totalRevenue ?? 0}</p>
          </div>
          <div className="bg-white p-4 rounded border">
            <p className="text-sm text-gray-500">Customers (events)</p>
            <p className="text-2xl font-semibold">{summary.uniqueCustomers ?? 0}</p>
          </div>
        </div>
      )}
      {customers.length > 0 && (
        <div className="bg-white p-4 rounded border mb-6">
          <h2 className="text-lg font-medium mb-4">Per customer (by event title)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={customers}>
              <XAxis dataKey="customer" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cleanings" fill="#3b82f6" name="Cleanings" />
              <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {(!summary && !customers.length) && (
        <p className="text-gray-500">No data in this range. Complete cleanings and link invoices for analytics.</p>
      )}
    </div>
  );
}
