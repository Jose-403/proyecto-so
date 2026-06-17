import { NextRequest, NextResponse } from 'next/server';
import { startCpuStress, stopCpuStress, startRamStress, stopRamStress, globalStressState } from '@/lib/stress-engine';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, type, threads, duration, memoryMB } = body;

  if (action === 'start') {
    if (type === 'cpu') startCpuStress(Number(threads || 2), Number(duration || 30));
    if (type === 'ram') startRamStress(Number(memoryMB || 500));
    return NextResponse.json({ status: 'started', type });
  }

  if (action === 'stop') {
    if (type === 'cpu') stopCpuStress();
    if (type === 'ram') stopRamStress();
    return NextResponse.json({ status: 'stopped', type });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    cpuActive: globalStressState.cpuActive,
    ramActive: globalStressState.ramActive,
  });
}