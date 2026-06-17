import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [snapshots, stressLogs] = await Promise.all([
    prisma.metricsSnapshot.findMany({
      orderBy: { timestamp: 'desc' },
      take: 120,
    }),
    prisma.stressLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50,
    }),
  ]);

  return NextResponse.json({ snapshots, stressLogs });
}
