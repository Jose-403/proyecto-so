#!/bin/sh
set -e

PRISMA_CLI="node ./node_modules/prisma/build/index.js"

echo "Aplicando migraciones de Prisma..."
$PRISMA_CLI migrate deploy

if [ "$RUN_SEED" = "true" ]; then
  echo "Ejecutando seed de datos iniciales..."
  $PRISMA_CLI db seed
fi

echo "Iniciando servidor Next.js..."
exec node server.js
