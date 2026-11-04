// Shared fetch helper for live providers: timeout, optional CORS proxy prefix and
// readable errors (including the claude.ai artifact sandbox, which blocks outside hosts).

export class ApiError extends Error {
  constructor(message, { status, service } = {}) {
    super(message);
    this.status = status;
    this.service = service;
  }
}

export async function http(url, { service, corsProxy, timeoutMs = 20000, ...init } = {}) {
  const target = corsProxy ? `${corsProxy}${corsProxy.includes('?') ? encodeURIComponent(url) : url}` : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(target, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new ApiError(`${service} took longer than ${timeoutMs / 1000}s to answer. Try again.`, { service });
    throw new ApiError(
      `Couldn't reach ${service}. The request was blocked or the network is down. Inside the claude.ai preview, outside APIs are blocked, so run the app locally (npm run dev) for Live API Mode, or add a CORS proxy in Settings.`,
      { service },
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.text();
      detail = body.slice(0, 200);
    } catch {
      /* ignore body read errors */
    }
    const hint = res.status === 401 || res.status === 403 ? ' Check the API key in Settings.' : res.status === 429 ? ' Rate limit reached; wait a minute.' : '';
    throw new ApiError(`${service} returned ${res.status}.${hint}${detail ? ` (${detail})` : ''}`, { status: res.status, service });
  }
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res.text();
}

/** Run async jobs with a concurrency limit, reporting progress. */
export async function pool(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      done++;
      onProgress?.(done / items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
