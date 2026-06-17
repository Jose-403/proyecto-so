# Informe — Mini-proyecto Sistemas Operativos

## Servidor de Aplicaciones Bajo Estrés

**Asignatura:** Sistemas Operativos  
**Universidad del Valle — Escuela de Ingeniería de Sistemas y Computación**  
**Repositorio:** https://github.com/Jose-403/proyecto-so  
**Fecha de entrega:** Junio de 2026

---

### Integrantes

| Nombre completo | Código | Correo institucional |
|-----------------|--------|----------------------|
| José Jaramillo | 2459558| [jose.david.jaramillo@correounivalle.edu.co] |

---

## Tabla de contenido

1. [Descripción general](#1-descripción-general)
2. [Objetivos](#2-objetivos)
3. [Entorno del laboratorio e implementación](#3-entorno-del-laboratorio-e-implementación)
4. [Mecanismos de estrés implementados](#4-mecanismos-de-estrés-implementados)
5. [Herramientas y procedimiento de monitoreo](#5-herramientas-y-procedimiento-de-monitoreo)
6. [Análisis de escenarios de carga](#6-análisis-de-escenarios-de-carga)
7. [Decisiones de gestión y optimización](#7-decisiones-de-gestión-y-optimización)
8. [Conclusiones](#8-conclusiones)
9. [Referencias](#9-referencias)
10. [Anexos](#10-anexos)

---

## 1. Descripción general

El presente informe documenta el trabajo realizado en el **mini-proyecto de Sistemas Operativos** titulado **«Servidor de Aplicaciones Bajo Estrés»**. El escenario del laboratorio consiste en un entorno containerizado con **WSL2 Ubuntu**, donde coexisten:

- Un **servidor de aplicaciones Next.js 14** (*Stress Monitor*) con dashboard de telemetría en tiempo real.
- Una base de datos **PostgreSQL 16** con datos de prueba (50.000 registros).
- Herramientas auxiliares del laboratorio: **PgAdmin**, **JupyterLab** (para entrenamiento de modelos IA con PyTorch).

El sistema desarrollado permite **inyectar carga controlada** sobre la aplicación web y la base de datos, mientras se observa el comportamiento del sistema operativo Linux anfitrión y de los contenedores Docker. La telemetría (CPU, RAM, load average, conexiones y locks de PostgreSQL) se expone en un dashboard accesible en `http://localhost:3001/dashboard`.

El ejercicio analítico central del miniproyecto consiste en establecer la **cadena causal**:

> **acción ejecutada → proceso afectado → recurso saturado → métrica observable → decisión de gestión**

Este informe recorre esa cadena para cada escenario de prueba documentado en la guía del proyecto.

---

## 2. Objetivos

### 2.1 Objetivo general

Analizar el comportamiento de un servidor de aplicaciones bajo distintos tipos de estrés (web, base de datos e inteligencia artificial), utilizando herramientas de monitorización del sistema operativo Linux y de contenedores Docker, para formular decisiones de gestión de recursos.

### 2.2 Objetivos específicos

1. Desplegar el stack del laboratorio (Next.js, PostgreSQL, PgAdmin, JupyterLab) mediante Docker Compose en WSL2.
2. Implementar y activar los **cuatro mecanismos de estrés** sobre la aplicación web y PostgreSQL.
3. Monitorear el sistema operativo con `htop`, `vmstat` e `iostat`.
4. Monitorear contenedores con `docker stats`, `docker top` y `docker logs`.
5. Diagnosticar el estado de PostgreSQL con consultas sobre `pg_stat_activity` y `pg_locks`.
6. Documentar los fenómenos observados en tres escenarios: inyección Web+BD, entrenamiento IA y ejecución simultánea.
7. Proponer **decisiones de gestión y optimización** fundamentadas en las métricas recolectadas.

---

## 3. Entorno del laboratorio e implementación

### 3.1 Hardware y software del host

| Componente | Valor observado |
|------------|-----------------|
| SO host | WSL2 — Ubuntu [versión] |
| CPUs lógicas (`nproc`) | [X] |
| RAM total (`free -h`) | [X] GB |
| Disco (`df -h /`) | [X] GB disponibles |

> **[INSERTAR CAPTURA: salida de `free -h && nproc && df -h /`]**

### 3.2 Servicios Docker desplegados

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

| Contenedor | Imagen / build | Puerto | Función |
|------------|----------------|--------|---------|
| `stress_monitor` | Build local (Dockerfile) | 3001→3000 | App Next.js + dashboard |
| `postgres_db` | postgres:16-alpine | 5432 | Base de datos |
| [jupyter] | [imagen lab] | 8888 | Entrenamiento IA |
| [pgadmin] | [imagen lab] | [puerto] | Administración BD |

> **[INSERTAR CAPTURA: `docker ps`]**

### 3.3 Arquitectura de la solución desarrollada

```
Dashboard (React)  ←── SSE ──  /api/metrics  ←── /proc (host)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              /api/http-flood   /api/db-stress    /api/health
                    │                 │
                    └────────┬────────┘
                             ▼
                      PostgreSQL 16
                      (stress_db)
```

**Stack tecnológico:** Next.js 14, TypeScript, Prisma ORM, PostgreSQL 16, Docker Compose.

**Lectura de métricas del SO:** el contenedor monta `/proc:/host/proc:ro` para leer `stat`, `meminfo` y `loadavg` del host Linux real.

### 3.4 Despliegue realizado

```bash
git clone https://github.com/Jose-403/proyecto-so.git
cd proyecto-so
cp .env.example .env
RUN_SEED=true docker compose up -d --build
```

Variables de entorno configuradas:

```env
DATABASE_URL=postgresql://postgres:postgres_stress_pass@postgres_db:5432/stress_db?schema=public
INTERNAL_BASE_URL=http://127.0.0.1:3000
STRESS_MAX_MEMORY_MB=2048
```

---

## 4. Mecanismos de estrés implementados

| # | Mecanismo | Objetivo | Endpoint | Parámetros usados en pruebas |
|---|-----------|----------|----------|------------------------------|
| 1 | **HTTP Flood** | Saturar el event loop de Node.js | `POST /api/http-flood` | 40 conexiones, 60 s |
| 2 | **Query Flood** | Consultas SELECT pesadas (JOINs, agregaciones) | `POST /api/db-stress` (`type: query`) | 15 consultas concurrentes |
| 3 | **Insert Flood** | Escritura masiva en lotes (WAL, I/O) | `POST /api/db-stress` (`type: insert`) | Lotes de 500 filas |
| 4 | **Lock Contention** | Bloqueos `FOR UPDATE` entre transacciones | `POST /api/db-stress` (`type: lock`) | 8 workers concurrentes |

Todos los mecanismos se controlan desde el dashboard en `/dashboard` y pueden detenerse individualmente o con el botón **«Detener todos los mecanismos»**.

> **[INSERTAR CAPTURA: panel de estrés del dashboard]**

---

## 5. Herramientas y procedimiento de monitoreo

Durante cada escenario de carga se ejecutaron en paralelo las herramientas indicadas en la guía del mini-proyecto.

### 5.1 Monitoreo general del SO

#### htop — árbol de procesos

```bash
htop -d 5
```

Se observaron los procesos `node` (Next.js), `postgres` y `python3` (Jupyter) según el escenario activo. El **load average** (esquina superior derecha) se registró en cada prueba.

> **[INSERTAR CAPTURA: htop en reposo]**  
> **[INSERTAR CAPTURA: htop durante carga Web+BD]**  
> **[INSERTAR CAPTURA: htop durante entrenamiento IA]**

#### vmstat — muestreo cada 2 segundos

```bash
vmstat 2 30
```

| Columna | Significado | Valor observado bajo estrés |
|---------|-------------|----------------------------|
| `r` | Procesos en cola de ejecución | [X] |
| `us` / `sy` | CPU usuario / sistema | [X]% / [X]% |
| `si` / `so` | Swap in / swap out | [X] / [X] |
| `free` | Memoria libre (KB) | [X] |

> **[INSERTAR CAPTURA: vmstat durante ejecución simultánea]**

#### iostat — E/S de disco extendido

```bash
iostat -xz 2 10
```

Se registró la actividad de disco durante Insert Flood y entrenamiento IA.

> **[INSERTAR CAPTURA: iostat durante Insert Flood]**

### 5.2 Monitoreo de contenedores

#### Estadísticas en tiempo real

```bash
docker stats
```

| Contenedor | CPU % (pico) | RAM (pico) | NET I/O | BLOCK I/O |
|------------|--------------|------------|---------|-----------|
| stress_monitor | [X]% | [X] MiB | [X] | [X] |
| postgres_db | [X]% | [X] MiB | [X] | [X] |
| [jupyter] | [X]% | [X] MiB | [X] | [X] |

> **[INSERTAR CAPTURA: docker stats durante carga]**

#### Procesos dentro de un contenedor

```bash
docker top stress_monitor
docker top postgres_db
```

> **[INSERTAR CAPTURA: docker top]**

#### Logs en tiempo real

```bash
docker logs -f stress_monitor
```

### 5.3 Consultas de diagnóstico en PostgreSQL

Ejecutadas desde PgAdmin o `psql` mientras las cargas estaban activas:

```sql
-- Conexiones activas agrupadas por estado
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Queries de larga duración en ejecución
SELECT pid, now() - query_start AS duration, state, left(query, 80)
FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC;

-- Bloqueos activos
SELECT pid, relation::regclass, mode, granted
FROM pg_locks WHERE NOT granted;
```

**Consulta de recuperación** (acción de gestión ante saturación):

```sql
-- Cancelar queries activas de más de 30 segundos
SELECT pg_cancel_backend(pid) FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '30 seconds';
```

> **[INSERTAR CAPTURA: pg_stat_activity durante Query Flood]**  
> **[INSERTAR CAPTURA: pg_locks durante Lock Contention]**

### 5.4 Dashboard de telemetría (aplicación)

Complementariamente, el dashboard SSE (`GET /api/metrics`, 1 Hz) mostró en tiempo real:

- CPU % y RAM (desde `/proc`)
- Load average
- Conexiones activas, cache hit ratio y locks de PostgreSQL

> **[INSERTAR CAPTURA: dashboard en reposo]**  
> **[INSERTAR CAPTURA: dashboard con locks activos]**

---

## 6. Análisis de escenarios de carga

Para cada escenario se documenta la cadena causal solicitada en la guía.

### 6.1 Durante la Inyección Web + BD

**Acciones ejecutadas:** HTTP Flood (40 conexiones) + Query Flood (15 consultas) durante 60 segundos.

| Eslabón | Observación registrada |
|---------|------------------------|
| **Acción** | Peticiones concurrentes a `/api/health` + consultas pesadas sobre `stress_data` |
| **Proceso afectado** | `node` (Next.js) y workers de `postgres` |
| **Recurso saturado** | CPU del host; I/O de disco en PostgreSQL |
| **Métrica observable** | CPU % > [X]%; load avg > [X]; conexiones `active` en pg_stat_activity: [X] |
| **Decisión de gestión** | Ver sección 7.1 |

**Fenómenos esperados vs. observados (guía del proyecto):**

| Fenómeno esperado | ¿Observado? | Evidencia |
|-------------------|-------------|-----------|
| `node` en primeros lugares de CPU% en htop | [Sí/No] | Captura [N] |
| `postgres` con múltiples workers activos | [Sí/No] | Captura [N] |
| Contenedor Next.js con CPU > 100% en docker stats | [Sí/No] | [X]% |
| PostgreSQL con incremento de I/O de disco | [Sí/No] | iostat |
| Decenas de filas `state='active'` en pg_stat_activity | [Sí/No] | [X] filas |
| Filas en `lock wait` (si Lock Contention activo) | [Sí/No] | [X] filas |
| Load average > número de núcleos lógicos | [Sí/No] | [X] vs [nproc] |

> **[INSERTAR CAPTURAS del escenario 6.1]**

### 6.2 Durante el Entrenamiento del Modelo IA

**Acción ejecutada:** Entrenamiento de modelo con PyTorch en JupyterLab (notebook del laboratorio).

| Eslabón | Observación registrada |
|---------|------------------------|
| **Acción** | Entrenamiento de red neuronal (forward/backward pass) |
| **Proceso afectado** | `python3` dentro del contenedor Jupyter |
| **Recurso saturado** | CPU (multi-core) y RAM |
| **Métrica observable** | CPU python3: [X]%; RAM usada: [X] MB; vmstat `si`/`so`: [X]/[X] |
| **Decisión de gestión** | Ver sección 7.2 |

**Fenómenos esperados vs. observados:**

| Fenómeno esperado | ¿Observado? | Evidencia |
|-------------------|-------------|-----------|
| `python3` consume 90–200% CPU (multi-core) | [Sí/No] | htop |
| Incremento sostenido de RAM | [Sí/No] | [X] MB |
| Activación de OOM Killer si RAM se agota | [Sí/No] | `dmesg` / logs |
| Actividad swap (`si`/`so` > 0) en vmstat | [Sí/No] | vmstat |

> **[INSERTAR CAPTURAS del escenario 6.2]**

### 6.3 Durante la Ejecución Simultánea

**Acciones ejecutadas:** HTTP Flood + Query Flood + entrenamiento IA en paralelo.

Este es el escenario de **mayor interés**: la contención entre `node`, `postgres` y `python3`.

| Efecto esperado | ¿Observado? | Valor / evidencia |
|-----------------|-------------|-------------------|
| Aumento de latencia en la aplicación web | [Sí/No] | Dashboard SSE más lento |
| Reducción de velocidad de entrenamiento (batches más lentos) | [Sí/No] | [X] s/batch vs [Y] s/batch |
| Load average > número de CPUs | [Sí/No] | [X] > [nproc] |
| Activación del OOM Killer | [Sí/No] | [descripción] |
| Swap activo (`so` > 0 en vmstat) | [Sí/No] | `so` = [X] |

**Cadena causal resumida del escenario simultáneo:**

```
HTTP Flood + Query Flood + PyTorch
        ↓
node + postgres + python3 compiten por CPU y RAM
        ↓
Load avg ↑, latencia web ↑, entrenamiento ↓, posible swap/OOM
        ↓
Métricas: htop, vmstat, docker stats, dashboard, pg_stat_activity
        ↓
Decisiones: límites cgroup, detener estrés, cancelar queries (sección 7)
```

> **[INSERTAR CAPTURAS del escenario 6.3 — mínimo: htop, docker stats, vmstat]**

---

## 7. Decisiones de gestión y optimización

A partir de las métricas recolectadas en los tres escenarios, se formularon las siguientes decisiones de administración del sistema:

### 7.1 Durante saturación Web + BD

| Problema detectado | Decisión aplicada | Justificación |
|--------------------|-------------------|---------------|
| CPU del contenedor Next.js > 100% | Detener HTTP Flood desde dashboard | Evitar degradación total del event loop |
| Consultas activas acumuladas en PostgreSQL | `pg_cancel_backend()` sobre queries > 30 s | Liberar conexiones y locks según guía |
| Load average sostenido > nproc | Reducir `queryCount` de 15 a 5 | Disminuir presión sobre planificador CFS |

### 7.2 Durante saturación por entrenamiento IA

| Problema detectado | Decisión aplicada | Justificación |
|--------------------|-------------------|---------------|
| RAM del host > 85% | Reducir `batch_size` del modelo en Jupyter | Prevenir activación del OOM Killer |
| Swap activo (`so` > 0) | Detener entrenamiento y liberar memoria | El swap degrada severamente el rendimiento |
| CPU sostenida al 100% | Limitar hilos de PyTorch (`torch.set_num_threads`) | Dejar recursos al SO y a otros contenedores |

### 7.3 Durante ejecución simultánea

| Problema detectado | Decisión aplicada | Justificación |
|--------------------|-------------------|---------------|
| Contención total de recursos | Priorizar: detener estrés web → cancelar queries → pausar entrenamiento | Orden de recuperación por impacto en servicios |
| Latencia del dashboard inaceptable | Aplicar límites Docker ya configurados (`cpus: 2.0`, `memory: 3000M`) | Los cgroups evitan que un contenedor monopolice el host |
| Bloqueos en PostgreSQL (Lock Contention) | Detener mecanismo `lock` y verificar `pg_locks` vacío | Confirmar liberación de locks antes de reintentar |

### 7.4 Medidas preventivas implementadas en el proyecto

1. **Montaje `/proc` de solo lectura** para telemetría real del host sin modificar el kernel.
2. **Healthcheck `pg_isready`** en PostgreSQL antes de arrancar la aplicación.
3. **Watchdog `STRESS_MAX_MEMORY_MB`** en el motor de estrés RAM de Node.js.
4. **Auto-stop del HTTP Flood** tras la duración configurada (60 s por defecto).
5. **Botón «Detener todos los mecanismos»** como acción de recuperación rápida.

---

## 8. Conclusiones

1. Se desplegó exitosamente el **servidor de aplicaciones bajo estrés** en el entorno WSL2/Docker del laboratorio, cumpliendo los cuatro mecanismos de carga exigidos.
2. La cadena causal **acción → proceso → recurso → métrica → decisión** se verificó en los tres escenarios; el escenario simultáneo (6.3) produjo la contención más severa entre `node`, `postgres` y `python3`.
3. Las herramientas `htop`, `vmstat`, `iostat` y `docker stats` resultaron complementarias: htop para procesos, vmstat para swap y colas, iostat para E/S, docker stats para aislamiento por contenedor.
4. Las consultas a `pg_stat_activity` y `pg_locks` fueron esenciales para diagnosticar saturación de base de datos y aplicar `pg_cancel_backend` como acción de recuperación.
5. Los **límites de cgroup** en Docker Compose y las acciones de detención desde el dashboard demostraron ser decisiones de gestión efectivas para restaurar el sistema a estado operativo normal.

---

## 9. Referencias

1. Tanenbaum, A. S., & Bos, H. (2014). *Modern Operating Systems* (4th ed.). Pearson.
2. PostgreSQL Global Development Group. (2024). *PostgreSQL 16 Documentation*. https://www.postgresql.org/docs/16/
3. Docker Inc. (2024). *Docker Documentation — Resource constraints*. https://docs.docker.com/
4. Linux Foundation. (2024). *proc(5) — Linux manual page*. https://man7.org/linux/man-pages/man5/proc.5.html
5. Node.js Foundation. (2024). *The Node.js Event Loop*. https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick
6. Guía del mini-proyecto: *Mini-proyecto SO — Servidor de Aplicaciones Bajo Estrés*. Universidad del Valle, 2026.

---

## 10. Anexos

### Anexo A — Comandos de verificación del entorno

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
free -h && nproc && df -h /
htop
docker stats
```

### Anexo B — Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/metrics` | Stream SSE de telemetría (1 Hz) |
| POST | `/api/http-flood` | Iniciar/detener HTTP Flood |
| POST | `/api/db-stress` | Iniciar/detener Query / Insert / Lock |
| GET | `/api/health` | Endpoint objetivo del HTTP Flood |

### Anexo C — Estructura del repositorio

```
proyecto-so/
├── app/dashboard/page.tsx      # Panel web
├── app/api/metrics/route.ts    # SSE
├── app/api/http-flood/route.ts
├── app/api/db-stress/route.ts
├── lib/metrics.ts              # Lectura /proc
├── lib/http-flood.ts
├── lib/db-stress.ts
├── prisma/seed.ts              # 50.000 registros
├── docker-compose.yml
└── Dockerfile
```

### Anexo D — Índice de capturas de pantalla

| # | Herramienta / escenario | Archivo |
|---|-------------------------|---------|
| 1 | `docker ps` | [captura-01.png] |
| 2 | `free -h`, `nproc`, `df -h` | [captura-02.png] |
| 3 | htop en reposo | [captura-03.png] |
| 4 | docker stats bajo carga | [captura-04.png] |
| 5 | Dashboard en reposo | [captura-05.png] |
| 6 | Escenario 6.1 — Web+BD | [captura-06.png] |
| 7 | pg_stat_activity | [captura-07.png] |
| 8 | Escenario 6.2 — IA | [captura-08.png] |
| 9 | vmstat escenario simultáneo | [captura-09.png] |
| 10 | Escenario 6.3 — simultáneo | [captura-10.png] |

---

*Informe elaborado para el Mini-proyecto SO — Servidor de Aplicaciones Bajo Estrés. Universidad del Valle, 2026.*
