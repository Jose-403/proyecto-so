# Stress Monitor — Mini-proyecto Sistemas Operativos

Aplicación web de estrés y monitoreo en tiempo real para el laboratorio de **Sistemas Operativos** (Universidad del Valle). Construida con **Next.js 14**, **TypeScript**, **Prisma** y **PostgreSQL**.

## Descripción

El sistema expone un dashboard que permite:

- Visualizar métricas en tiempo real: **CPU%**, **RAM%**, conexiones activas de PostgreSQL y locks.
- Iniciar y detener **cuatro mecanismos de estrés** requeridos por el mini-proyecto.

## Mecanismos de estrés implementados

| Mecanismo | Objetivo | Endpoint |
|-----------|----------|----------|
| **HTTP Flood** | Saturar el event loop de Node.js con peticiones concurrentes | `POST /api/http-flood` |
| **Query Flood** | Consultas SELECT con JOINs y agregaciones pesadas | `POST /api/db-stress` (`type: query`) |
| **Insert Flood** | Inserción masiva en lotes (batch INSERT) | `POST /api/db-stress` (`type: insert`) |
| **Lock Contention** | Bloqueos entre transacciones (`FOR UPDATE`) | `POST /api/db-stress` (`type: lock`) |

Las métricas se transmiten vía **Server-Sent Events** en `GET /api/metrics`.

## Requisitos

- Node.js 18+
- Docker y Docker Compose (entorno WSL2 Ubuntu del laboratorio)
- PostgreSQL 16 (incluido en `docker-compose.yml` o el existente del laboratorio)

## Instalación local (desarrollo)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Levantar PostgreSQL (si no existe el del laboratorio)
docker compose up -d postgres_db

# 4. Aplicar migraciones y datos de prueba
npx prisma migrate deploy
npm run prisma:seed

# 5. Iniciar en modo desarrollo
npm run dev
```

Abrir: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## Despliegue con Docker (laboratorio)

### Opción A — Stack completo incluido

```bash
docker compose up -d --build
```

El servicio queda en el puerto **3001** → `http://localhost:3001/dashboard`

### Opción B — Agregar al docker-compose.yml existente

Copie el bloque `stress_monitor` de este `docker-compose.yml` al compose del laboratorio (sin modificar los servicios previos: Next.js, PostgreSQL, PgAdmin, JupyterLab).

Variables de entorno necesarias:

```env
DATABASE_URL=postgresql://postgres:postgres_stress_pass@postgres_db:5432/stress_db?schema=public
INTERNAL_BASE_URL=http://127.0.0.1:3000
STRESS_MAX_MEMORY_MB=2048
```

Montaje recomendado para leer métricas del host Linux:

```yaml
volumes:
  - /proc:/host/proc:ro
```

### Seed inicial de la base de datos

Tras el primer despliegue, ejecutar dentro del contenedor o contra la BD:

```bash
RUN_SEED=true docker compose up -d --build
# o manualmente:
docker compose exec stress_monitor npx prisma db seed
```

## Estructura del proyecto

```
app/
  api/
    metrics/       # SSE de telemetría
    http-flood/    # Control HTTP Flood
    db-stress/     # Query, Insert y Lock Contention
    health/        # Endpoint objetivo del HTTP Flood
  dashboard/       # Panel de control web
lib/
  metrics.ts       # Lectura de /proc y pg_stat_activity
  http-flood.ts    # Motor HTTP Flood
  db-stress.ts     # Motor de estrés PostgreSQL
prisma/
  schema.prisma
  seed.ts          # 50.000 registros de prueba
```

## Verificación del entorno (según guía del mini-proyecto)

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
free -h && nproc && df -h /
htop
docker stats
```

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run prisma:migrate` | Migraciones en desarrollo |
| `npm run prisma:deploy` | Migraciones en producción |
| `npm run prisma:seed` | Cargar 50.000 registros de prueba |

## Notas técnicas

- Las métricas de CPU/RAM se leen desde `/host/proc` (montaje Docker) o `/proc` en Linux.
- En Windows sin Docker, el dashboard muestra valores de respaldo para desarrollo.
- El HTTP Flood apunta a `INTERNAL_BASE_URL` (por defecto `http://127.0.0.1:3000`).

## Integrantes
JOSE DAVID JARAMILLO 2459558-3743

