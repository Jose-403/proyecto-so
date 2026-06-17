let httpFloodActive = false;
let httpFloodTimer: NodeJS.Timeout | null = null;

export interface HttpFloodState {
  active: boolean;
  totalRequests: number;
  failedRequests: number;
}

export const httpFloodState: HttpFloodState = {
  active: false,
  totalRequests: 0,
  failedRequests: 0,
};

function getBaseUrl(): string {
  return process.env.INTERNAL_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

async function fireHttpRequest(): Promise<void> {
  const baseUrl = getBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    httpFloodState.totalRequests += 1;
    if (!response.ok) {
      httpFloodState.failedRequests += 1;
    }
  } catch {
    httpFloodState.totalRequests += 1;
    httpFloodState.failedRequests += 1;
  }
}

export function startHttpFlood(concurrency: number, durationSec: number): void {
  if (httpFloodActive) return;

  httpFloodActive = true;
  httpFloodState.active = true;
  httpFloodState.totalRequests = 0;
  httpFloodState.failedRequests = 0;

  console.log(`[HTTP FLOOD] Iniciando con ${concurrency} conexiones concurrentes.`);

  httpFloodTimer = setInterval(() => {
    if (!httpFloodActive) return;

    const batch = Array.from({ length: concurrency }, () => fireHttpRequest());
    void Promise.all(batch);
  }, 100);

  setTimeout(() => {
    stopHttpFlood();
  }, durationSec * 1000);
}

export function stopHttpFlood(): void {
  httpFloodActive = false;
  httpFloodState.active = false;

  if (httpFloodTimer) {
    clearInterval(httpFloodTimer);
    httpFloodTimer = null;
  }

  console.log('[HTTP FLOOD] Detenido.');
}

export function getHttpFloodStatus(): HttpFloodState {
  return { ...httpFloodState };
}
