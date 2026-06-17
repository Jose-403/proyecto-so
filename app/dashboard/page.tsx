'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface MetricsData {
  cpu: { total: number };
  ram: { total: number; used: number };
  loadAvg: number[];
  postgres: {
    activeConnections: number;
    cacheHitRatio: number;
    locks: number;
  };
  timestamp: string;
}

export default function Dashboard() {
  const [metricsHistory, setMetricsHistory] = useState<MetricsData[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<MetricsData | null>(null);

  const [httpConnections, setHttpConnections] = useState(20);
  const [httpDuration, setHttpDuration] = useState(60);
  const [queryCount, setQueryCount] = useState(15);
  const [batchSize, setBatchSize] = useState(500);
  const [lockWorkers, setLockWorkers] = useState(8);
  const [cpuThreads, setCpuThreads] = useState(2);
  const [cpuDuration, setCpuDuration] = useState(30);
  const [ramMB, setRamMB] = useState(500);

  useEffect(() => {
    const eventSource = new EventSource('/api/metrics');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as MetricsData;
      setCurrentMetrics(data);

      setMetricsHistory((prev) => {
        const updated = [...prev, data];
        if (updated.length > 60) updated.shift();
        return updated;
      });
    };

    return () => eventSource.close();
  }, []);

  const callStressApi = async (url: string, body: Record<string, unknown>) => {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  };

  const getColorClass = (val: number) => {
    if (val < 60) return 'text-emerald-500 border-emerald-500';
    if (val < 85) return 'text-amber-500 border-amber-500';
    return 'text-rose-500 border-rose-500 font-bold animate-pulse';
  };

  if (!currentMetrics) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Estableciendo conexión con canal de telemetría de /proc...
      </div>
    );
  }

  const ramPercent = (currentMetrics.ram.used / currentMetrics.ram.total) * 100;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      <header className="border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Chaos Engine & Kernel Monitor
          </h1>
          <p className="text-sm text-slate-400">
            Mini-proyecto SO — Monitoreo en tiempo real (CPU, RAM, PostgreSQL)
          </p>
        </div>
        <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800">
          <span className="text-xs text-slate-400 block">Load Average</span>
          <span className="font-mono text-lg">
            {currentMetrics.loadAvg.map((l) => l.toFixed(2)).join(' | ')}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap gap-3 text-xs">
        <a
          href="http://localhost:5050"
          target="_blank"
          rel="noreferrer"
          className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-cyan-400 hover:border-cyan-500"
        >
          PgAdmin → localhost:5050
        </a>
        <a
          href="http://localhost:8888"
          target="_blank"
          rel="noreferrer"
          className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-orange-400 hover:border-orange-500"
        >
          JupyterLab → localhost:8888 (token: stress_lab_token)
        </a>
        <span className="bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg text-slate-400">
          Histórico BD: GET /api/snapshots
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-2">CPU</h3>
          <div className={`text-4xl font-mono border-l-4 pl-3 ${getColorClass(currentMetrics.cpu.total)}`}>
            {currentMetrics.cpu.total.toFixed(1)}%
          </div>
          <div className="h-40 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timestamp" hide />
                <YAxis domain={[0, 100]} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Line
                  type="monotone"
                  dataKey="cpu.total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-2">RAM</h3>
          <div className={`text-4xl font-mono border-l-4 pl-3 ${getColorClass(ramPercent)}`}>
            {currentMetrics.ram.used.toFixed(0)}{' '}
            <span className="text-xs text-slate-500">/ {currentMetrics.ram.total.toFixed(0)} MB</span>
          </div>
          <div className="h-40 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metricsHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timestamp" hide />
                <YAxis domain={[0, currentMetrics.ram.total]} stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Line
                  type="monotone"
                  dataKey="ram.used"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-slate-400 font-medium text-sm uppercase tracking-wider mb-2">
            PostgreSQL
          </h3>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">Conexiones activas</span>
              <span className="text-2xl font-mono font-bold text-amber-500">
                {currentMetrics.postgres.activeConnections}
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 block">Cache Hit Ratio</span>
              <span className="text-2xl font-mono font-bold text-indigo-400">
                {currentMetrics.postgres.cacheHitRatio}%
              </span>
            </div>
          </div>
          <div className="mt-4 bg-slate-950 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
            <span className="text-xs text-slate-400">Locks activos:</span>
            <span
              className={`font-mono text-sm px-2 py-0.5 rounded ${
                currentMetrics.postgres.locks > 0
                  ? 'bg-rose-950 text-rose-400 animate-pulse'
                  : 'bg-slate-900 text-slate-400'
              }`}
            >
              {currentMetrics.postgres.locks}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-6">Panel de Estrés (Requisitos del Mini-proyecto)</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-blue-400">1. HTTP Flood</h4>
            <p className="text-xs text-slate-500">
              Inunda el servidor con peticiones HTTP concurrentes al endpoint /api/health.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Conexiones concurrentes: <span>{httpConnections}</span>
            </label>
            <input
              type="range"
              min="5"
              max="100"
              value={httpConnections}
              onChange={(e) => setHttpConnections(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <label className="text-xs text-slate-400 flex justify-between">
              Duración (seg): <span>{httpDuration}</span>
            </label>
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={httpDuration}
              onChange={(e) => setHttpDuration(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/http-flood', {
                    action: 'start',
                    connections: httpConnections,
                    duration: httpDuration,
                  })
                }
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar HTTP Flood
              </button>
              <button
                onClick={() => callStressApi('/api/http-flood', { action: 'stop' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-indigo-400">2. Query Flood</h4>
            <p className="text-xs text-slate-500">
              Consultas SELECT con JOINs y agregaciones pesadas sobre PostgreSQL.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Consultas concurrentes: <span>{queryCount}</span>
            </label>
            <input
              type="range"
              min="5"
              max="50"
              value={queryCount}
              onChange={(e) => setQueryCount(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/db-stress', {
                    action: 'start',
                    type: 'query',
                    queryCount,
                  })
                }
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar Query Flood
              </button>
              <button
                onClick={() => callStressApi('/api/db-stress', { action: 'stop', type: 'query' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-emerald-400">3. Insert Flood</h4>
            <p className="text-xs text-slate-500">
              Inserción en lotes (batch INSERT) para estresar escritura y WAL de PostgreSQL.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Tamaño del lote: <span>{batchSize} filas</span>
            </label>
            <input
              type="range"
              min="100"
              max="2000"
              step="100"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/db-stress', {
                    action: 'start',
                    type: 'insert',
                    batchSize,
                  })
                }
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar Insert Flood
              </button>
              <button
                onClick={() => callStressApi('/api/db-stress', { action: 'stop', type: 'insert' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-rose-400">4. Lock Contention</h4>
            <p className="text-xs text-slate-500">
              Transacciones concurrentes con FOR UPDATE para generar bloqueos en pg_locks.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Workers concurrentes: <span>{lockWorkers}</span>
            </label>
            <input
              type="range"
              min="2"
              max="30"
              value={lockWorkers}
              onChange={(e) => setLockWorkers(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/db-stress', {
                    action: 'start',
                    type: 'lock',
                    lockWorkers,
                  })
                }
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar Lock Contention
              </button>
              <button
                onClick={() => callStressApi('/api/db-stress', { action: 'stop', type: 'lock' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-amber-400">5. Estrés CPU (complementario)</h4>
            <p className="text-xs text-slate-500">
              Carga síncrona del event loop (Fibonacci / ordenamiento). Útil para escenario 6.3.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Hilos ficticios: <span>{cpuThreads}</span>
            </label>
            <input
              type="range"
              min="1"
              max="8"
              value={cpuThreads}
              onChange={(e) => setCpuThreads(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <label className="text-xs text-slate-400 flex justify-between">
              Duración (seg): <span>{cpuDuration}</span>
            </label>
            <input
              type="range"
              min="10"
              max="120"
              step="10"
              value={cpuDuration}
              onChange={(e) => setCpuDuration(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/stress', {
                    action: 'start',
                    type: 'cpu',
                    threads: cpuThreads,
                    duration: cpuDuration,
                  })
                }
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar CPU
              </button>
              <button
                onClick={() => callStressApi('/api/stress', { action: 'stop', type: 'cpu' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <h4 className="font-semibold text-purple-400">6. Estrés RAM (complementario)</h4>
            <p className="text-xs text-slate-500">
              Alocación progresiva de buffers. Watchdog según STRESS_MAX_MEMORY_MB.
            </p>
            <label className="text-xs text-slate-400 flex justify-between">
              Memoria objetivo: <span>{ramMB} MB</span>
            </label>
            <input
              type="range"
              min="100"
              max="1500"
              step="100"
              value={ramMB}
              onChange={(e) => setRamMB(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  callStressApi('/api/stress', {
                    action: 'start',
                    type: 'ram',
                    memoryMB: ramMB,
                  })
                }
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 rounded-lg text-sm"
              >
                Iniciar RAM
              </button>
              <button
                onClick={() => callStressApi('/api/stress', { action: 'stop', type: 'ram' })}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm"
              >
                Detener
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800">
          <h4 className="font-semibold text-orange-400 mb-2">Escenario 6.2 — Entrenamiento IA (JupyterLab)</h4>
          <p className="text-xs text-slate-500 mb-2">
            Abra JupyterLab y ejecute el notebook <code className="text-slate-300">training_ai_model.ipynb</code>{' '}
            (enviado por el profesor). Monitoree con htop y docker stats.
          </p>
          <code className="text-xs text-slate-400 block">
            docker compose exec stress-ai-lab python /home/jovyan/work/entrenamiento_ia.py
          </code>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={async () => {
              await callStressApi('/api/http-flood', { action: 'stop' });
              await callStressApi('/api/db-stress', { action: 'stop' });
              await callStressApi('/api/stress', { action: 'stop', type: 'cpu' });
              await callStressApi('/api/stress', { action: 'stop', type: 'ram' });
            }}
            className="bg-rose-700 hover:bg-rose-600 text-white font-semibold px-6 py-2 rounded-lg text-sm"
          >
            Detener todos los mecanismos
          </button>
        </div>
      </div>
    </div>
  );
}
