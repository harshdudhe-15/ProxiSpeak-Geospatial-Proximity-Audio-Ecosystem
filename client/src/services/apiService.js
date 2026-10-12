/**
 * REST API client for ProxiSpeak
 */

const getApiBase = () => {
  const baseUrl = import.meta.env.VITE_API_URL;

  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/api`;
  }

  return 'http://localhost:5000/api';
};

export async function fetchOffices() {
  const res = await fetch(`${getApiBase()}/offices`);
  if (!res.ok) throw new Error('Failed to fetch offices');
  const data = await res.json();
  return data.data;
}

export async function createOffice(payload) {
  const res = await fetch(`${getApiBase()}/offices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to create office');
  }
  const data = await res.json();
  return data.data;
}

export async function fetchOfficeLayout(id) {
  const res = await fetch(`${getApiBase()}/offices/${id}/layout`);
  if (!res.ok) throw new Error('Failed to fetch office layout');
  const data = await res.json();
  return data.data;
}

export async function createSession(userData) {
  const res = await fetch(`${getApiBase()}/users/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Failed to create session');
  }
  const data = await res.json();
  return data.data;
}

export async function fetchNearbyUsersPlanar(officeId, x, y, radius = 120) {
  const res = await fetch(`${getApiBase()}/offices/${officeId}/nearby?x=${x}&y=${y}&radius=${radius}`);
  if (!res.ok) throw new Error('Failed to query nearby users');
  const data = await res.json();
  return data.data;
}
