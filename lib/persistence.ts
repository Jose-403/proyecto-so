import { prisma } from '@/lib/prisma';

export async function saveMetricsSnapshot(
  cpuPercent: number,
  ramUsedMb: number,
  activeConnections: number
): Promise<void> {
  try {
    await prisma.metricsSnapshot.create({
      data: { cpuPercent, ramUsedMb, activeConnections },
    });
  } catch (err) {
    console.error('[PERSISTENCE] Error guardando snapshot:', err);
  }
}

export async function logStressEvent(
  stressType: string,
  intensity: number,
  durationMs: number
): Promise<void> {
  try {
    await prisma.stressLog.create({
      data: { stressType, intensity, durationMs },
    });
  } catch (err) {
    console.error('[PERSISTENCE] Error registrando estrés:', err);
  }
}
