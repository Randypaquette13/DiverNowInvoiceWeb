import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { login } from '../api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => {
      queryClient.setQueryData(['me'], (data) => data || { email });
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => {
      setError(err.body?.error || err.message || 'Login failed');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Diver Now Admin</h1>
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded">{error}</div>
        )}
        <label className="block mb-2 text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
          required
          autoComplete="email"
        />
        <label className="block mb-2 text-sm font-medium text-gray-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded mb-6"
          required
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
