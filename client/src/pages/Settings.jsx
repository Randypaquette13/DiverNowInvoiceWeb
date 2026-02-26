import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getIntegrations, updateIntegrations, getSquareLocations } from '../api';

export default function Settings() {
  const queryClient = useQueryClient();
  const [squareToken, setSquareToken] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: getIntegrations,
  });

  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ['square-locations'],
    queryFn: getSquareLocations,
    enabled: false,
  });

  const updateMutation = useMutation({
    mutationFn: updateIntegrations,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      setSaveMessage('Saved.');
      setTimeout(() => setSaveMessage(''), 3000);
    },
    onError: (err) => {
      setSaveMessage(err.body?.error || err.message || 'Save failed');
    },
  });

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
      <div className="mt-6">
        <h2 className="font-medium text-gray-900 mb-2">Google Calendar</h2>
        <p className="text-sm text-gray-600 mb-2">
          Connect your Google account from the Dashboard by clicking &quot;Connect Google Calendar&quot;.
        </p>
        {integrations?.google_connected && (
          <span className="text-sm text-green-600">Google Calendar connected</span>
        )}
      </div>
    </div>
  );
}
