#!/bin/sh
set -e

echo "Aplicando migraciones de Prisma..."
npx prisma migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Ejecutando seed de datos iniciales..."
  npx prisma db seed
fi

echo "Iniciando servidor Next.js..."
exec node server.js
