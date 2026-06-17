import { NextRequest, NextResponse } from 'next/server';
import { getSystemMetrics, getPostgresMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  let isHeartbeatActive = true;

  req.signal.addEventListener('abort', () => {
    isHeartbeatActive = false;
    writer.close();
  });

  // Loop de transmisión con frecuencia de muestreo de 1Hz (1 Segundo)
  const interval = setInterval(async () => {
    if (!isHeartbeatActive) {
      clearInterval(interval);
      return;
    }

    const baseMetrics = getSystemMetrics();
    const pgMetrics = await getPostgresMetrics();
    
    const aggregatedData = {
      ...baseMetrics,
      postgres: pgMetrics,
      timestamp: new Date().toLocaleTimeString()
    };

    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(aggregatedData)}\n\n`));
    } catch {
      clearInterval(interval);
    }
  }, 1000);

  return new NextResponse(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}