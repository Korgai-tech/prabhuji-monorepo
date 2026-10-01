import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../auth/auth-context';
import { Button } from '../../components/ui/button';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error: reqError } = await api.POST('/auth/login', {
      body: { email, password },
    });
    if (reqError || !data?.success) {
      setError('Invalid credentials');
      return;
    }
    login(data.data.token);
    navigate('/users');
  }

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="mx-auto mt-24 flex max-w-sm flex-col gap-3"
    >
      <h1 className="text-xl font-semibold">Admin login</h1>
      <input
        className="border rounded p-2"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border rounded p-2"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Sign in</Button>
    </form>
  );
}
