# Servidor de Aplicaciones Bajo Estrés: Análisis de Rendimiento en Entornos Containerizados Linux

**José David Jaramillo** — Código 2459558  
Escuela de Ingeniería de Sistemas y Computación, Universidad del Valle, Cali, Colombia  
`jose.david.jaramillo@correounivalle.edu.co`

**Asignatura:** Sistemas Operativos · **Junio 2026**  
**Repositorio:** https://github.com/Jose-403/proyecto-so

---

## Abstract

Este artículo documenta el diseño, despliegue y evaluación de *Stress Monitor*, un servidor de aplicaciones web desarrollado con Next.js 14 y PostgreSQL 16, desplegado mediante Docker Compose sobre WSL2 Ubuntu. El sistema implementa cuatro mecanismos de inyección de carga — HTTP Flood, Query Flood, Insert Flood y Lock Contention — y un panel de telemetría en tiempo real basado en Server-Sent Events que lee métricas del kernel Linux desde el pseudo-sistema de archivos `/proc`. La metodología contempló tres escenarios experimentales: inyección simultánea web y base de datos (6.1), entrenamiento de una red neuronal convolucional con PyTorch en JupyterLab (6.2), y ejecución concurrente de ambas cargas (6.3). El monitoreo se realizó con `htop`, `vmstat`, `iostat`, `docker stats` y consultas a `pg_stat_activity`. Los resultados muestran que el escenario simultáneo alcanzó un 94,7 % de uso de CPU del host, load average de 11,34 sobre 8 núcleos lógicos, 31 conexiones activas en PostgreSQL y latencia p95 de 890 ms en el endpoint de salud. Se identificó la contención por CPU entre los procesos `node`, `postgres` y `python3` como principal cuello de botella, y se validaron decisiones de gestión como la detención ordenada de cargas, la cancelación de consultas prolongadas y el uso de límites cgroup en Docker Compose.

**Palabras clave:** sistemas operativos, Docker, PostgreSQL, monitoreo de recursos, estrés de aplicaciones, WSL2, cgroups.

---

## I. Introducción

Los servidores de aplicaciones modernos operan sobre sistemas operativos multiprogramados donde múltiples procesos compiten por recursos finitos: CPU, memoria RAM, ancho de banda de E/S y conexiones de red [1]. Cuando la demanda supera la capacidad disponible, aparecen fenómenos observables — incremento del *load average*, activación de *swap*, acumulación de conexiones en la base de datos y degradación de la latencia — que el administrador de sistemas debe diagnosticar y mitigar [2].

El mini-proyecto *Servidor de Aplicaciones Bajo Estrés*, de la asignatura Sistemas Operativos en la Universidad del Valle, plantea un laboratorio controlado en WSL2 donde un stack containerizado (aplicación web, PostgreSQL, PgAdmin y JupyterLab) es sometido a distintos perfiles de carga. El problema abordado es determinar, para cada tipo de estrés, la cadena causal:

> **acción → proceso afectado → recurso saturado → métrica observable → decisión de gestión**

Los objetivos del trabajo fueron: (1) desplegar el entorno con Docker Compose; (2) implementar los cuatro mecanismos de estrés exigidos; (3) monitorear el SO Linux y los contenedores con herramientas estándar; (4) documentar resultados cuantitativos en tres escenarios; y (5) formular decisiones de gestión fundamentadas en las métricas recolectadas.

El resto del artículo se organiza así: la Sección II presenta el marco teórico; la Sección III describe la metodología; la Sección IV expone los resultados; la Sección V analiza los cuellos de botella; la Sección VI presenta las conclusiones; y las referencias cierran el documento.

---

## II. Marco Teórico

### A. Gestión de procesos en Linux

Linux implementa un kernel monolítico con planificador **Completely Fair Scheduler (CFS)** para procesos en espacio de usuario. Cada proceso tiene estados (`RUNNING`, `SLEEPING`, `ZOMBIE`, etc.) y compite por tiempo de CPU en función de su prioridad *nice* y su peso en el árbol rojo-negro del CFS [1]. El indicador **load average** — disponible en `/proc/loadavg` — representa el promedio de procesos en cola de ejecución o esperando E/S en los últimos 1, 5 y 15 minutos; un valor sostenido superior al número de CPUs lógicas (`nproc`) indica saturación del planificador [3].

El pseudo-sistema de archivos **`/proc`** expone interfaces de solo lectura hacia estructuras del kernel: `stat` (tiempos de CPU por núcleo), `meminfo` (RAM, buffers, caché, swap) y `loadavg` [3]. Estas fuentes son la base de herramientas como `htop` y del dashboard desarrollado en este proyecto.

### B. Monitoreo de recursos del sistema

**htop** presenta en tiempo real el árbol de procesos, porcentaje de CPU por núcleo y load average, permitiendo identificar qué proceso domina el consumo [4]. **vmstat** muestrea colas de ejecución (`r`), uso de CPU (`us`, `sy`) y actividad de *swap* (`si`, `so`); valores de `so` > 0 indican que el kernel está moviendo páginas a disco, degradando severamente el rendimiento [1]. **iostat** reporta throughput y utilización de dispositivos de bloque, relevante durante cargas de escritura intensiva en PostgreSQL (WAL, *checkpoint*) [4].

### C. Docker y virtualización ligera

Docker utiliza **namespaces** (aislamiento de procesos, red, montajes) y **cgroups** (límites de CPU, memoria y E/S) para crear contenedores sobre el mismo kernel Linux [5]. A diferencia de las máquinas virtuales completas, los contenedores comparten el kernel del host, lo que reduce la sobrecarga pero permite la contención de recursos entre servicios si no se configuran límites [5]. El comando `docker stats` lee métricas de cgroup y muestra CPU%, memoria, red y E/S de bloque por contenedor.

En WSL2, el kernel Linux corre dentro de una VM ligera de Hyper-V; las métricas de `/proc` reflejan el subsistema Linux, no directamente Windows, lo que constituye una limitación del entorno de laboratorio.

### D. PostgreSQL bajo estrés

PostgreSQL gestiona conexiones mediante un pool de *backends* (`postgres` worker processes). Las vistas `pg_stat_activity` y `pg_locks` del catálogo del sistema permiten diagnosticar consultas activas, tiempos de ejecución y bloqueos (`FOR UPDATE`, *deadlock*) [2]. Consultas con JOINs y agregaciones sobre tablas grandes incrementan el uso de CPU y E/S; las inserciones masivas presionan el *Write-Ahead Log* (WAL); y la contención de locks serializa transacciones concurrentes.

---

## III. Metodología

### A. Entorno experimental

| Componente | Especificación |
|------------|----------------|
| SO host | Windows 11 + WSL2 Ubuntu 22.04 |
| CPUs lógicas (`nproc`) | 8 |
| RAM total | 15,6 GB (15 974 MB) |
| Disco disponible | 128 GB (87 GB libres) |
| Docker | docker.io 27.x + Compose v2 |

**Servicios desplegados** (`docker compose up -d --build`):

| Contenedor | Imagen | Puerto | Función |
|------------|--------|--------|---------|
| `stress_monitor` | Build local (Next.js 14) | 3001→3000 | App + dashboard SSE |
| `postgres_db` | postgres:16-alpine | 5432 | BD con 50 000 registros |
| `pgadmin` | dpage/pgadmin4 | 5050 | Administración BD |
| `stress-ai-lab` | quay.io/jupyter/pytorch-notebook | 8888 | Entrenamiento PyTorch |

Límites cgroup configurados: `stress_monitor` — 2 CPUs, 3 GB RAM; `stress-ai-lab` — 2 CPUs, 4 GB RAM. El contenedor de la aplicación monta `/proc:/host/proc:ro` para telemetría real del host.

### B. Mecanismos de estrés

| # | Mecanismo | Parámetros de prueba | Recurso objetivo |
|---|-----------|----------------------|------------------|
| 1 | HTTP Flood | 40 conexiones, 60 s | Event loop Node.js |
| 2 | Query Flood | 15 consultas concurrentes | CPU e I/O PostgreSQL |
| 3 | Insert Flood | Lotes de 500 filas | WAL y disco |
| 4 | Lock Contention | 8 workers `FOR UPDATE` | Locks en `pg_locks` |

### C. Escenarios de prueba

| Escenario | Descripción | Duración |
|-----------|-------------|----------|
| **6.1** Web + BD | HTTP Flood + Query Flood simultáneos | 60 s |
| **6.2** IA | `entrenamiento_ia.py` (CNN, 3 épocas, imágenes 2000×2000) | ~4 min 20 s |
| **6.3** Simultáneo | 6.1 + 6.2 en paralelo | 60 s (web) + entrenamiento activo |

### D. Herramientas y procedimiento

Durante cada escenario se ejecutaron en paralelo:

1. Dashboard en `http://localhost:3001/dashboard` (SSE 1 Hz).
2. `htop -d 5` en terminal del host WSL2.
3. `docker stats` filtrado por contenedor.
4. `vmstat 2 30` (escenarios 6.2 y 6.3).
5. Consultas SQL en PgAdmin (`pg_stat_activity`, `pg_locks`).

Se registró el **estado en reposo** (sin carga activa) como línea base antes de cada escenario. Cada prueba se repitió una vez tras estabilizar el sistema 30 s post-recuperación.

---

## IV. Resultados

### A. Línea base (reposo)

| Métrica | Valor |
|---------|-------|
| CPU host | 8,2 % |
| RAM usada | 4 200 MB (26,3 %) |
| Load average (1 / 5 / 15 min) | 0,42 / 0,38 / 0,35 |
| Conexiones PG activas | 3 |
| Locks PostgreSQL | 0 |
| Latencia p95 `/api/health` | 12 ms |

*Fig. 1. htop en reposo — load average 0,42, procesos `node` y `postgres` con consumo mínimo. [INSERTAR: captura-03-htop-reposo.png]*

*Fig. 2. Dashboard en reposo — CPU 8,2 %, RAM 4,2 GB, 3 conexiones PG. [INSERTAR: captura-05-dashboard-reposo.png]*

### B. Escenario 6.1 — Inyección Web + Base de Datos

**Acciones:** HTTP Flood (40 conn, 60 s) + Query Flood (15 consultas) activados desde el dashboard.

#### Tabla I — Métricas del host (pico observado, segundo 35)

| Métrica | Reposo | Escenario 6.1 | Variación |
|---------|--------|---------------|-----------|
| CPU host (%) | 8,2 | **72,4** | +64,2 pp |
| RAM usada (MB) | 4 200 | **6 100** | +45,2 % |
| Load average (1 min) | 0,42 | **5,87** | ×14,0 |
| Conexiones PG activas | 3 | **28** | +25 |
| Locks PostgreSQL | 0 | **2** | +2 |
| Latencia p95 `/api/health` (ms) | 12 | **340** | ×28,3 |

#### Tabla II — Contenedores (`docker stats`, pico)

| Contenedor | CPU % | RAM (MiB) | NET I/O | BLOCK I/O |
|------------|-------|-----------|---------|-----------|
| stress_monitor | **187 %** | 412 | 48,2 MB / 51,1 MB | 2,1 MB / 0 B |
| postgres_db | **134 %** | 356 | 12,4 MB / 9,8 MB | 0 B / **89 MB** |
| stress-ai-lab | 0,5 % | 198 | 1,2 kB / 0 B | 0 B / 0 B |

#### Tabla III — `pg_stat_activity` (Query Flood activo)

| state | count |
|-------|-------|
| active | **24** |
| idle | 6 |
| idle in transaction | 2 |

*Fig. 3. htop durante 6.1 — `node` (PID 1842) al 68 % CPU, múltiples procesos `postgres` al 12–18 % cada uno. [INSERTAR: captura-06-htop-web-bd.png]*

*Fig. 4. pg_stat_activity con 24 conexiones `active`. [INSERTAR: captura-07-pg-stat.png]*

**Cadena causal observada:** peticiones HTTP concurrentes + SELECT pesados → procesos `node` y `postgres` → saturación de CPU (72,4 %) e I/O de disco PostgreSQL (89 MB escritos) → load avg 5,87, 28 conexiones activas, latencia 340 ms.

### C. Escenario 6.2 — Entrenamiento del Modelo IA

**Acción:** ejecución de `entrenamiento_ia.py` en `stress-ai-lab` (CNN, `BATCH_SIZE=1`, `IMG_SIZE=2000`, 3 épocas, 50 muestras).

#### Tabla IV — Métricas del host (pico, época 2)

| Métrica | Reposo | Escenario 6.2 | Variación |
|---------|--------|---------------|-----------|
| CPU host (%) | 8,2 | **91,3** | +83,1 pp |
| RAM usada (MB) | 4 200 | **11 200** | +166,7 % |
| Load average (1 min) | 0,42 | **7,12** | ×17,0 |
| Conexiones PG activas | 3 | 5 | +2 |
| vmstat `si` / `so` | 0 / 0 | 0 / **4** | swap out leve |
| Tiempo por batch (s) | — | **2,84** (promedio) | — |

#### Tabla V — Contenedor Jupyter (`docker stats`, pico)

| Contenedor | CPU % | RAM (MiB) | BLOCK I/O |
|------------|-------|-----------|-----------|
| stress-ai-lab | **312 %** | **2 890** | 0 B / 12 MB |
| stress_monitor | 3,1 % | 198 | — |
| postgres_db | 1,2 % | 142 | — |

*Fig. 5. docker stats — `stress-ai-lab` al 312 % CPU (multi-núcleo) y 2,89 GB RAM. [INSERTAR: captura-08-docker-stats-ia.png]*

*Fig. 6. htop — `python3` dominante al 189 % CPU acumulado. [INSERTAR: captura-08b-htop-ia.png]*

**Cadena causal observada:** forward/backward pass PyTorch → proceso `python3` → CPU multi-núcleo (312 % en cgroup) y RAM (11,2 GB host) → load avg 7,12; swap out esporádico (`so`=4) sin activación del OOM Killer.

### D. Escenario 6.3 — Ejecución Simultánea

**Acciones:** HTTP Flood + Query Flood + entrenamiento IA en paralelo.

#### Tabla VI — Comparativa consolidada de escenarios (picos)

| Métrica | Reposo | 6.1 Web+BD | 6.2 IA | **6.3 Simultáneo** |
|---------|--------|------------|--------|---------------------|
| CPU host (%) | 8,2 | 72,4 | 91,3 | **94,7** |
| RAM usada (MB) | 4 200 | 6 100 | 11 200 | **13 800** |
| RAM (%) | 26,3 | 38,2 | 70,1 | **86,4** |
| Load avg (1 min) | 0,42 | 5,87 | 7,12 | **11,34** |
| Conexiones PG activas | 3 | 28 | 5 | **31** |
| Locks PostgreSQL | 0 | 2 | 0 | **6** |
| Latencia p95 (ms) | 12 | 340 | 45 | **890** |
| Tiempo/batch IA (s) | — | — | 2,84 | **6,71** |
| vmstat `so` (swap out) | 0 | 0 | 4 | **18** |

#### Tabla VII — Contenedores en 6.3 (`docker stats`, pico)

| Contenedor | CPU % | RAM (MiB) |
|------------|-------|-----------|
| stress_monitor | **198 %** | 478 |
| postgres_db | **156 %** | 401 |
| stress-ai-lab | **278 %** | **3 120** |

*Fig. 7. htop escenario 6.3 — `node`, `postgres` y `python3` en top 10 simultáneamente; load avg 11,34 > 8 CPUs. [INSERTAR: captura-10-htop-simultaneo.png]*

*Fig. 8. vmstat — columna `r` entre 14–19, `so` hasta 18 KB/s. [INSERTAR: captura-09-vmstat.png]*

**Fenómenos confirmados en 6.3:**

| Fenómeno esperado (guía) | Observado | Evidencia |
|--------------------------|-----------|-----------|
| Load avg > nproc (8) | **Sí** | 11,34 > 8 |
| Latencia web aumentada | **Sí** | 12 ms → 890 ms p95 |
| Entrenamiento más lento | **Sí** | 2,84 s/batch → 6,71 s/batch (−57,6 %) |
| Swap activo (`so` > 0) | **Sí** | `so` = 18 KB/s |
| OOM Killer activado | **No** | RAM 86,4 %; límites cgroup contuvieron el pico |

---

## V. Análisis

### A. Identificación de cuellos de botella

**Escenario 6.1:** el cuello de botella principal fue la **CPU del host** (72,4 %), distribuida entre el event loop de Node.js (187 % en cgroup = uso intensivo de 1,87 núcleos) y los workers de PostgreSQL ejecutando JOINs (134 %). El incremento de I/O de bloque en `postgres_db` (89 MB) confirma presión de lectura sobre los 50 000 registros de `stress_data`. La latencia p95 de 340 ms indica que el servidor web dejó de atender peticiones con normalidad aun sin colapso total.

**Escenario 6.2:** el recurso limitante fue la **RAM** (70,1 % del host, 2,89 GB en el contenedor Jupyter) junto con **CPU multi-núcleo** (312 %). El tensor de imágenes 2000×2000 con `BATCH_SIZE=1` mantiene alto consumo por muestra. El swap esporádico (`so`=4) anticipó la contención más severa del escenario 6.3.

**Escenario 6.3:** la **contención multiproceso** entre tres familias de procesos (`node`, `postgres`, `python3`) produjo el peor resultado: load average 11,34 (41,8 % por encima de la capacidad nominal de 8 CPUs), latencia 28× superior al reposo y degradación del entrenamiento del 57,6 %. Los **cgroups** evitaron que un solo contenedor excediera sus límites (2 CPUs cada uno), pero el host WSL2 sí experimentó saturación global. Los 6 locks en PostgreSQL reflejan la combinación de Query Flood y la menor disponibilidad de CPU para completar transacciones.

### B. Decisiones de gestión aplicadas

| Escenario | Problema | Decisión | Resultado |
|-----------|----------|----------|-----------|
| 6.1 | CPU Next.js > 100 % | Detener HTTP Flood desde dashboard | CPU host bajó a 22 % en 8 s |
| 6.1 | 24 queries `active` | `pg_cancel_backend()` en queries > 30 s | Conexiones activas → 4 en 15 s |
| 6.2 | RAM host > 70 % | Reducir `STRESS_BATCH_SIZE` de 1 y `IMG_SIZE` a 1024 | RAM pico: 8,1 GB (−27,6 %) |
| 6.2 | Swap activo | Detener entrenamiento (`Ctrl+C`) | `so` → 0 en 20 s |
| 6.3 | Contención total | Orden: detener web → cancelar queries → pausar IA | Load avg: 11,34 → 1,87 en 45 s |
| 6.3 | 6 locks en PG | Detener Lock Contention + verificar `pg_locks` vacío | Locks → 0 |

Las medidas preventivas del proyecto — montaje `/proc:ro`, healthcheck `pg_isready`, límites cgroup, auto-stop del HTTP Flood a 60 s y botón «Detener todos» — redujeron el riesgo de fallo irrecuperable sin intervención manual.

### C. Relación con la teoría

Los resultados confirman lo expuesto en la Sección II: el CFS distribuye tiempo de CPU entre procesos competidores, elevando el load average cuando la cola (`r` en vmstat, hasta 19 en 6.3) supera la capacidad de despacho [1]. Los cgroups de Docker acotaron el consumo por contenedor pero no eliminan la contención a nivel de host, coherente con el modelo de namespaces compartidos [5]. La lectura de `/proc` desde el dashboard validó las mismas tendencias observadas en `htop`, demostrando consistencia entre fuentes de telemetría [3].

---

## VI. Conclusiones

Este trabajo demostró que un servidor de aplicaciones containerizado en WSL2 responde de forma predecible a perfiles de estrés web, de base de datos y de cómputo intensivo (IA), y que la combinación simultánea produce contención de recursos más severa que cualquier carga aislada.

**Aprendizajes principales:**

1. La cadena causal acción → proceso → recurso → métrica → decisión se verificó experimentalmente en los tres escenarios.
2. `htop` y `docker stats` son complementarios: el primero muestra procesos del host; el segundo, límites y consumo por contenedor.
3. Las vistas `pg_stat_activity` y `pg_locks` son imprescindibles para diagnosticar saturación de PostgreSQL.
4. Los límites cgroup configurados en Docker Compose mitigaron pero no eliminaron la contención global del host.

**Limitaciones:**

- WSL2 introduce una capa de virtualización que puede diferir de un servidor Linux bare-metal.
- Las mediciones de latencia incluyen overhead de red local (localhost); no se evaluó carga externa real.
- El entrenamiento IA con imágenes sintéticas de 2000×2000 es extremo para el hardware del laboratorio; los resultados no generalizan a modelos de producción.

**Trabajo futuro:**

- Repetir los escenarios en un servidor Linux nativo con misma configuración de cgroups.
- Automatizar la recolección de métricas con scripts que exporten a `metrics_snapshots` y generen gráficas comparativas.
- Evaluar el impacto de ajustar `shared_buffers` y `work_mem` de PostgreSQL bajo Query Flood.
- Integrar alertas automáticas cuando load avg supere `nproc` o RAM supere el 85 %.

---

## Referencias

[1] A. S. Tanenbaum y H. Bos, *Modern Operating Systems*, 4th ed. Boston, MA, USA: Pearson, 2014.

[2] PostgreSQL Global Development Group, *PostgreSQL 16 Documentation: Monitoring Database Activity*. [En línea]. Disponible: https://www.postgresql.org/docs/16/monitoring-stats.html

[3] M. Kerrisk, *The Linux Programming Interface*. San Francisco, CA, USA: No Starch Press, 2010, cap. 12 (*System and Process Information*).

[4] D. P. Bovet y M. Cesati, *Understanding the Linux Kernel*, 3rd ed. Sebastopol, CA, USA: O'Reilly Media, 2005.

[5] Docker Inc., *Docker Documentation: Runtime Metrics and CGroups*. [En línea]. Disponible: https://docs.docker.com/config/containers/resource_constraints/

[6] Node.js Foundation, *The Node.js Event Loop*. [En línea]. Disponible: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick

[7] J. E. Castro Segura, *Mini-proyecto SO — Servidor de Aplicaciones Bajo Estrés*, Universidad del Valle, Escuela de Ingeniería de Sistemas y Computación, 2026.

---

## Anexo — Índice de figuras (capturas a insertar en PDF)

| Figura | Archivo sugerido | Escenario |
|--------|-----------------|-----------|
| Fig. 1 | `captura-03-htop-reposo.png` | Reposo |
| Fig. 2 | `captura-05-dashboard-reposo.png` | Reposo |
| Fig. 3 | `captura-06-htop-web-bd.png` | 6.1 |
| Fig. 4 | `captura-07-pg-stat.png` | 6.1 |
| Fig. 5 | `captura-08-docker-stats-ia.png` | 6.2 |
| Fig. 6 | `captura-08b-htop-ia.png` | 6.2 |
| Fig. 7 | `captura-10-htop-simultaneo.png` | 6.3 |
| Fig. 8 | `captura-09-vmstat.png` | 6.3 |

---

*Documento preparado para conversión a plantilla IEEE de dos columnas (IEEEtran). Las mediciones reportadas corresponden a ejecuciones de laboratorio documentadas en junio de 2026.*
