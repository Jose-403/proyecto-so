import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = Array.from({ length: 50 }, (_, index) => ({
    id: index,
    value: Math.random(),
  }));

  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    payload,
  });
}
