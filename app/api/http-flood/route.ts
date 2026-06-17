import { NextRequest, NextResponse } from 'next/server';
import { getHttpFloodStatus, startHttpFlood, stopHttpFlood } from '@/lib/http-flood';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, connections, duration } = body;

  if (action === 'start') {
    startHttpFlood(Number(connections || 20), Number(duration || 60));
    return NextResponse.json({ status: 'started', type: 'http' });
  }

  if (action === 'stop') {
    stopHttpFlood();
    return NextResponse.json({ status: 'stopped', type: 'http' });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}

export async function GET() {
  return NextResponse.json(getHttpFloodStatus());
}
