import fs from 'fs';
import { prisma } from '@/lib/prisma';

// Intentar leer la ruta montada del host de Docker, si no, fallback a local (desarrollo directo)
const PROC_PATH = fs.existsSync('/host/proc') ? '/host/proc' : '/proc';

let lastCpuTime = { idle: 0, total: 0 };

export interface SystemMetrics {
  cpu: { total: number; cores: number[] };
  ram: { total: number; used: number; free: number; buffers: number; cached: number };
  loadAvg: number[];
  postgres: { activeConnections: number; cacheHitRatio: number; locks: number };
}

export function getSystemMetrics(): SystemMetrics {
  const fallbackMetrics: SystemMetrics = {
    cpu: { total: 0, cores: [] },
    ram: { total: 16384, used: 4096, free: 12288, buffers: 0, cached: 0 },
    loadAvg: [0.5, 0.7, 0.4],
    postgres: { activeConnections: 1, cacheHitRatio: 99.9, locks: 0 }
  };

  if (process.platform !== 'linux' && !fs.existsSync(PROC_PATH)) {
    return fallbackMetrics; 
  }

  try {
    // 1. PROCESAMIENTO DE CPU (/proc/stat)
    const statLines = fs.readFileSync(`${PROC_PATH}/stat`, 'utf8').split('\n');
    const cpuTotalLine = statLines[0].split(/\s+/).slice(1).map(Number);
    const idle = cpuTotalLine[3] + cpuTotalLine[4]; // idle + iowait
    const total = cpuTotalLine.reduce((a, b) => a + b, 0);
    
    const diffIdle = idle - lastCpuTime.idle;
    const diffTotal = total - lastCpuTime.total;
    const cpuPercent = diffTotal > 0 ? (1 - diffIdle / diffTotal) * 100 : 0;
    
    lastCpuTime = { idle, total };

    // 2. PROCESAMIENTO DE MEMORIA (/proc/meminfo)
    const meminfo = fs.readFileSync(`${PROC_PATH}/meminfo`, 'utf8');
    const getMemValue = (key: string) => {
      const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
      return match ? parseInt(match[1]) / 1024 : 0; // Convertir kB a MB
    };

    const memTotal = getMemValue('MemTotal');
    const memFree = getMemValue('MemFree');
    const buffers = getMemValue('Buffers');
    const cached = getMemValue('Cached');
    const memUsed = memTotal - memFree - buffers - cached;

    // 3. LOAD AVERAGE (/proc/loadavg)
    const loadAvgStr = fs.readFileSync(`${PROC_PATH}/loadavg`, 'utf8').split(' ');
    const loadAvg = [parseFloat(loadAvgStr[0]), parseFloat(loadAvgStr[1]), parseFloat(loadAvgStr[2])];

    return {
      cpu: { total: Math.min(100, Math.max(0, cpuPercent)), cores: [] },
      ram: { total: memTotal, used: memUsed, free: memFree, buffers, cached },
      loadAvg,
      postgres: { activeConnections: 0, cacheHitRatio: 100, locks: 0 } // Se inyecta asíncronamente
    };
  } catch (err) {
    console.error("Error leyendo /proc:", err);
    return fallbackMetrics;
  }
}

export async function getPostgresMetrics() {
  try {
    const activeConns: any[] = await prisma.$queryRaw`SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active';`;
    const locks: any[] = await prisma.$queryRaw`SELECT count(*)::int FROM pg_locks;`;
    const cacheHit: any[] = await prisma.$queryRaw`
      SELECT 
        (sum(heap_blks_hit) / (sum(heap_blks_read) + sum(heap_blks_hit) + 1) * 100)::float as ratio 
      FROM pg_statio_user_tables;`;

    return {
      activeConnections: activeConns[0].count || 0,
      cacheHitRatio: Math.round(cacheHit[0]?.ratio || 100),
      locks: locks[0].count || 0
    };
  } catch {
    return { activeConnections: 0, cacheHitRatio: 0, locks: 0 };
  }
}