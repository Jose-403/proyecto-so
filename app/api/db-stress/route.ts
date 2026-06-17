import { NextRequest, NextResponse } from 'next/server';
import { getDbStressStatus, startDbStress, stopDbStress } from '@/lib/db-stress';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, type, queryCount, batchSize, lockWorkers } = body;

  const validTypes = ['query', 'insert', 'lock'] as const;

  if (action === 'start') {
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Tipo de estrés DB inválido' }, { status: 400 });
    }

    startDbStress(type, {
      queryCount: Number(queryCount || 10),
      batchSize: Number(batchSize || 500),
      lockWorkers: Number(lockWorkers || 5),
    });

    return NextResponse.json({ status: 'started', type });
  }

  if (action === 'stop') {
    if (type && validTypes.includes(type)) {
      stopDbStress(type);
      return NextResponse.json({ status: 'stopped', type });
    }

    stopDbStress();
    return NextResponse.json({ status: 'stopped', type: 'all' });
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}

export async function GET() {
  return NextResponse.json(getDbStressStatus());
}
