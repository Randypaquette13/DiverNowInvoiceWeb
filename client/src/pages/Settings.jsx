import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getIntegrations, updateIntegrations, getSquareLocations, getCalendarList } from '../api';

export default function Settings() {
  const queryClient = useQueryClient();
  const [squareToken, setSquareToken] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: getIntegrations,
  });

  const { data: calendarList = [] } = useQuery({
    queryKey: ['calendar-list'],
    queryFn: getCalendarList,
    enabled: Boolean(integrations?.google_connected),
  });

  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['square-locations'],
    queryFn: getSquareLocations,
    enabled: false,
  });

  const updateMutation = useMutation({
    mutationFn: updateIntegrations,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      if (variables?.google_calendar_id !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['events'] });
      }
      setSaveMessage('Saved.');
      setTimeout(() => setSaveMessage(''), 3000);
    },
    onError: (err) => {
      setSaveMessage(err.body?.error || err.message || 'Save failed');
    },
  });

  const selectedCalendarId = integrations?.google_calendar_id ?? 'primary';

  function handleCalendarChange(google_calendar_id) {
    const id = google_calendar_id || 'primary';
    if (id === selectedCalendarId) return;
    setSaveMessage('');
    updateMutation.mutate({ google_calendar_id: id });
  }

  function handleSquareSubmit(e) {
    e.preventDefault();
    setSaveMessage('');
    updateMutation.mutate({
      square_access_token: squareToken || null,
      square_location_id: (squareLocationId && squareLocationId.trim()) || null,
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-4">Settings</h1>
      <div className="bg-white border rounded-lg p-6 max-w-md mb-6">
        <h2 className="font-medium text-gray-900 mb-2">Square</h2>
        <p className="text-sm text-gray-600 mb-4">
          Add your Square access token and location ID to load invoices and create new ones. Get an access token from the Square Developer Dashboard (sandbox or production).
        </p>
        <form onSubmit={handleSquareSubmit}>
          <label className="block text-sm text-gray-700 mb-1">Access token</label>
          <input
            type="password"
            value={squareToken}
            onChange={(e) => setSquareToken(e.target.value)}
            placeholder={integrations?.square_connected ? '••••••••' : 'Paste access token'}
            className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
          />
          <div className="flex items-center gap-2 mb-3">
            <label className="block text-sm text-gray-700 mb-1">Location ID</label>
            <button
              type="button"
              onClick={() => refetchLocations()}
              className="text-sm text-blue-600 hover:underline"
            >
              Load locations
            </button>
          </div>
          {locations.length > 0 ? (
            <select
              value={squareLocationId}
              onChange={(e) => setSquareLocationId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
            >
              <option value="">Select location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name || loc.business_name || loc.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={squareLocationId}
              onChange={(e) => setSquareLocationId(e.target.value)}
              placeholder="Location ID"
              className="w-full border border-gray-300 rounded px-3 py-2 mb-3"
            />
          )}
          {saveMessage && (
            <p className={`mb-3 text-sm ${saveMessage.startsWith('Saved') ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
      <div className="bg-white border rounded-lg p-6 max-w-md mb-6">
        <h2 className="font-medium text-gray-900 mb-2">Google Calendar</h2>
        <p className="text-sm text-gray-600 mb-4">
          Connect your Google account to sync events to the Dashboard. Choose which calendar to use; only that calendar&apos;s events will be shown.
        </p>
        <a
          href="/api/auth/google"
          className="inline-block px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm mb-4"
        >
          {integrations?.google_connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
        </a>
        {integrations?.google_connected && calendarList.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm text-gray-700 mb-1">Calendar</label>
            <select
              value={selectedCalendarId}
              onChange={(e) => handleCalendarChange(e.target.value)}
              disabled={updateMutation.isPending}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              {calendarList.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}{cal.primary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Only events from the selected calendar are shown on the Dashboard.
            </p>
          </div>
        )}
        {integrations?.google_connected && calendarList.length === 0 && (
          <span className="text-sm text-green-600">Google Calendar connected</span>
        )}
      </div>
    </div>
  );
}
