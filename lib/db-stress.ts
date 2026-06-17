import crypto from 'crypto';
import { logStressEvent } from '@/lib/persistence';
import { prisma } from '@/lib/prisma';

type DbStressType = 'query' | 'insert' | 'lock';

interface DbStressFlags {
  query: boolean;
  insert: boolean;
  lock: boolean;
}

const activeStress: DbStressFlags = {
  query: false,
  insert: false,
  lock: false,
};

let queryCount = 10;
let batchSize = 500;
let lockWorkers = 5;

const basePayload = crypto.randomBytes(512).toString('hex');

async function runQueryFlood(): Promise<void> {
  while (activeStress.query) {
    const promises = Array.from({ length: queryCount }, () => {
      const choice = Math.random();
      if (choice < 0.5) {
        return prisma.$queryRaw`
          SELECT COUNT(*), AVG(random_number), MAX(LENGTH(payload))
          FROM stress_data
          WHERE payload LIKE '%abc%' OR payload LIKE '%xyz%'
        `.catch(() => null);
      }
      return prisma.$queryRaw`
        SELECT t1.id, t2.random_number, COUNT(t3.id)
        FROM stress_data t1
        CROSS JOIN stress_data t2
        JOIN stress_data t3 ON t1.random_number = t3.random_number
        GROUP BY t1.id, t2.random_number
        LIMIT 3000
      `.catch(() => null);
    });

    await Promise.all(promises);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function runInsertFlood(): Promise<void> {
  while (activeStress.insert) {
    const rows = Array.from({ length: batchSize }, () => ({
      payload: basePayload,
      randomNumber: Math.floor(Math.random() * 1_000_000),
    }));

    await prisma.stressData.createMany({ data: rows }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function runLockContention(): Promise<void> {
  while (activeStress.lock) {
    const workers = Array.from({ length: lockWorkers }, () =>
      prisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM stress_data WHERE id = 1 FOR UPDATE`;
          await new Promise((resolve) => setTimeout(resolve, 300));
        })
        .catch(() => null)
    );

    await Promise.all(workers);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function startDbStress(
  type: DbStressType,
  options?: { queryCount?: number; batchSize?: number; lockWorkers?: number }
): void {
  if (options?.queryCount) queryCount = options.queryCount;
  if (options?.batchSize) batchSize = options.batchSize;
  if (options?.lockWorkers) lockWorkers = options.lockWorkers;

  if (activeStress[type]) return;

  activeStress[type] = true;
  console.log(`[STRESS DB] Iniciando mecanismo: ${type}`);

  const intensity =
    type === 'query' ? queryCount : type === 'insert' ? batchSize : lockWorkers;
  void logStressEvent(`db-${type}`, intensity, 0);

  if (type === 'query') void runQueryFlood();
  if (type === 'insert') void runInsertFlood();
  if (type === 'lock') void runLockContention();
}

export function stopDbStress(type?: DbStressType): void {
  if (type) {
    activeStress[type] = false;
    console.log(`[STRESS DB] Detenido: ${type}`);
    return;
  }

  activeStress.query = false;
  activeStress.insert = false;
  activeStress.lock = false;
  console.log('[STRESS DB] Todos los mecanismos detenidos.');
}

export function getDbStressStatus(): DbStressFlags {
  return { ...activeStress };
}
