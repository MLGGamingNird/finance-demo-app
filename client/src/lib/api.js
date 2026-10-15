export const API_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  // data is the whole error body, for endpoints that send more than fields.
  constructor(message, status, fields = {}, data = null) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.data = data;
  }
}

export async function apiFetch(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.fields, data);
  }
  return data;
}
