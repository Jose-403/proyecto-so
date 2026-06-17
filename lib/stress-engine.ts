import { logStressEvent } from '@/lib/persistence';

export interface StressState {
  cpuActive: boolean;
  ramActive: boolean;
  allocatedBuffers: Buffer[];
  workers: NodeJS.Timeout[];
}

export const globalStressState: StressState = {
  cpuActive: false,
  ramActive: false,
  allocatedBuffers: [],
  workers: []
};

/**
 * SOBRECARGA DE CPU: Ejecuta de forma síncrona y recursiva cálculos ineficientes
 * para bloquear deliberadamente el Event Loop o subprocesos (según el número de ejecuciones).
 */
function recursiveFibonacci(n: number): number {
  if (n <= 1) return n;
  return recursiveFibonacci(n - 1) + recursiveFibonacci(n - 2);
}

function heavySorting() {
  const arr = Array.from({ length: 50000 }, () => Math.random());
  // Bubble sort deliberadamente ineficiente para causar picos brutales de CPU
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
}

export function startCpuStress(threads: number, duration: number) {
  if (globalStressState.cpuActive) return;
  globalStressState.cpuActive = true;

  console.log(`[STRESS] Iniciando sobrecarga de CPU con ${threads} hilos ficticios.`);
  void logStressEvent('cpu', threads, duration * 1000);

  const intervalId = setInterval(() => {
    if (!globalStressState.cpuActive) return;
    
    // Simular concurrencia repitiendo el cálculo pesado bloqueante
    for (let i = 0; i < threads; i++) {
      // Alternamos algoritmos ineficientes
      if (Math.random() > 0.5) {
        recursiveFibonacci(40); // O(2^n) Complejidad temporal exponencial extrema
      } else {
        heavySorting(); // O(n^2) Complejidad ineficiente
      }
    }
  }, 50);

  globalStressState.workers.push(intervalId);

  // Watchdog de Duración del Stress
  setTimeout(() => {
    stopCpuStress();
  }, duration * 1000);
}

export function stopCpuStress() {
  globalStressState.cpuActive = false;
  console.log(`[STRESS] Deteniendo sobrecarga de CPU.`);
}

/**
 * SOBRECARGA DE MEMORIA: Reserva buffers masivos progresivos dentro de la heap de Node.js.
 */
export function startRamStress(memoryMB: number) {
  if (globalStressState.ramActive) return;
  globalStressState.ramActive = true;

  console.log(`[STRESS] Solicitada alocación progresiva de RAM: ${memoryMB} MB.`);
  void logStressEvent('ram', memoryMB, 0);

  const stepMB = 50; // Alocar en bloques controlados de 50MB
  let currentAllocated = 0;

  const intervalId = setInterval(() => {
    if (!globalStressState.ramActive || currentAllocated >= memoryMB) {
      clearInterval(intervalId);
      return;
    }

    try {
      // Watchdog de seguridad crítico contra OOM (Out Of Memory) en el Host
      const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      const limit = parseInt(process.env.STRESS_MAX_MEMORY_MB || '2048');
      
      if (memoryUsage > limit * 0.9) {
        console.warn(`[WATCHDOG] Consumo de RAM crítico (${memoryUsage.toFixed(0)}MB). Abortando stress preventivamente.`);
        stopRamStress();
        return;
      }

      // Alocación forzada de Buffer en la memoria binaria (Capa nativa de V8)
      const buffer = Buffer.alloc(stepMB * 1024 * 1024, 'X');
      globalStressState.allocatedBuffers.push(buffer);
      currentAllocated += stepMB;
      console.log(`[STRESS] Alocados +${stepMB}MB. Total del test actual: ${currentAllocated}MB`);
    } catch (err) {
      console.error("[STRESS] Error alocando memoria:", err);
      stopRamStress();
    }
  }, 200);

  globalStressState.workers.push(intervalId);
}

export function stopRamStress() {
  globalStressState.ramActive = false;
  // Limpieza explícita del recolector de basura desreferenciando los buffers
  globalStressState.allocatedBuffers = [];
  if (global.gc) global.gc(); // Forzar si Next.js corre con flag --expose-gc
  console.log(`[STRESS] Buffers de memoria liberados.`);
}