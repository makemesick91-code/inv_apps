const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

/** Fired when an authenticated API call returns 401 (token expired/revoked). */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : null) ?? res.statusText ?? 'Request failed';

    // If we sent a token and got 401, the token is expired or revoked.
    // Clear it and notify the app so it can redirect to login.
    if (res.status === 401 && token && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    throw new ApiError(message, res.status, body);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
