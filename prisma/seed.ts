import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando Seeding de 50,000 registros...');
  const batchSize = 5000;
  const totalRecords = 50000;
  
  // Generar string de 1KB exacto
  const basePayload = crypto.randomBytes(512).toString('hex'); 

  for (let i = 0; i < totalRecords; i += batchSize) {
    const data = Array.from({ length: batchSize }).map(() => ({
      payload: basePayload,
      randomNumber: Math.floor(Math.random() * 1000000),
    }));

    await prisma.stressData.createMany({ data });
    console.log(`Insertados ${i + batchSize} registros...`);
  }
  console.log('Seeding completado exitosamente.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });