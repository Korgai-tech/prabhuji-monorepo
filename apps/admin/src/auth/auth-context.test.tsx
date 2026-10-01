import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';

afterEach(() => localStorage.clear());

test('login stores the token and flips isAuthenticated; logout clears it', () => {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  expect(result.current.isAuthenticated).toBe(false);
  act(() => result.current.login('tok123'));
  expect(result.current.isAuthenticated).toBe(true);
  expect(localStorage.getItem('admin_token')).toBe('tok123');
  act(() => result.current.logout());
  expect(result.current.isAuthenticated).toBe(false);
  expect(localStorage.getItem('admin_token')).toBeNull();
});
