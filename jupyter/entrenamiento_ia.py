"""
Escenario 6.2 — Entrenamiento IA (script equivalente a training_ai_model.ipynb)
Ejecutar en JupyterLab o desde terminal:

  docker compose exec stress-ai-lab python /home/jovyan/work/entrenamiento_ia.py

Monitorear en otra terminal: docker stats stress-ai-lab
"""

from __future__ import annotations

import math
import os
import time

import matplotlib.pyplot as plt
import numpy as np
import psutil
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset

# Ajustar según RAM del equipo (ver comentarios en el notebook del profesor)
IMG_SIZE = int(os.environ.get("STRESS_IMG_SIZE", "2000"))
BATCH_SIZE = int(os.environ.get("STRESS_BATCH_SIZE", "1"))
NUM_SAMPLES = int(os.environ.get("STRESS_NUM_SAMPLES", "50"))
EPOCHS = int(os.environ.get("STRESS_EPOCHS", "3"))
NUM_WORKERS = int(os.environ.get("STRESS_NUM_WORKERS", "0"))


class SystemMonitor:
    def __init__(self) -> None:
        self.cpu_history: list[float] = []
        self.ram_history: list[float] = []
        self.timestamps: list[float] = []

    def snapshot(self) -> None:
        self.cpu_history.append(psutil.cpu_percent(interval=0.1))
        self.ram_history.append(psutil.virtual_memory().percent)
        self.timestamps.append(time.time())

    def plot(self) -> None:
        plt.figure(figsize=(12, 4))
        plt.subplot(1, 2, 1)
        plt.plot(self.cpu_history, "r-", alpha=0.7)
        plt.title("CPU Usage (%)")
        plt.xlabel("Muestras")
        plt.subplot(1, 2, 2)
        plt.plot(self.ram_history, "b-", alpha=0.7)
        plt.title("RAM Usage (%)")
        plt.xlabel("Muestras")
        plt.tight_layout()
        out = os.path.join(os.path.dirname(__file__), "monitor_plot.png")
        plt.savefig(out)
        print(f"Gráfica guardada en: {out}")


class ExtremeStressDataset(Dataset):
    def __init__(self, num_samples: int, img_size: int, monitor: SystemMonitor) -> None:
        self.num_samples = num_samples
        self.img_size = img_size
        self.monitor = monitor
        print(f"Generando {num_samples} imágenes de {img_size}x{img_size}")
        print(f"Memoria estimada por imagen: {3 * img_size * img_size * 4 / 1e9:.2f} GB")

    def __len__(self) -> int:
        return self.num_samples

    def __getitem__(self, idx: int):
        img = np.random.randn(3, self.img_size, self.img_size).astype(np.float32)
        label = np.random.randint(0, 10)
        if idx % 10 == 0:
            self.monitor.snapshot()
        return torch.from_numpy(img), torch.tensor(label)


class ResourceIntensiveModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.conv_layers = nn.Sequential(
            nn.Conv2d(3, 64, kernel_size=3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.ReLU(),
            nn.Conv2d(128, 256, kernel_size=3, stride=2, padding=1),
            nn.ReLU(),
            nn.AdaptiveAvgPool2d((32, 32)),
        )
        self.fc_layers = nn.Sequential(
            nn.Linear(256 * 32 * 32, 4096),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(4096, 4096),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(4096, 10),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.conv_layers(x)
        x = x.view(x.size(0), -1)
        return self.fc_layers(x)


def print_system_info() -> None:
    print("=" * 50)
    print("CONFIGURACIÓN DEL SISTEMA")
    print("=" * 50)
    print(f"CPU Físicos    : {psutil.cpu_count(logical=False)}")
    print(f"CPU Lógicos    : {psutil.cpu_count(logical=True)}")
    print(f"RAM Total      : {psutil.virtual_memory().total / 1e9:.2f} GB")
    print(f"RAM Disponible : {psutil.virtual_memory().available / 1e9:.2f} GB")
    print(f"PyTorch Threads: {torch.get_num_threads()}")
    print(f"Contenedor     : {'SI' if os.path.exists('/.dockerenv') else 'NO'}")
    print("=" * 50)


def estres_cpu() -> list[float]:
    """Alternativa del notebook: carga CPU con cálculos trigonométricos."""
    resultados = []
    for _ in range(10000):
        resultado = sum(math.sin(x) * math.cos(x) for x in range(100))
        resultados.append(resultado)
    return resultados


def train() -> None:
    monitor = SystemMonitor()
    print_system_info()

    dataset = ExtremeStressDataset(NUM_SAMPLES, IMG_SIZE, monitor)
    dataloader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=NUM_WORKERS,
    )

    model = ResourceIntensiveModel()
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Parámetros del modelo: {total_params:,}")
    print(f"Memoria estimada del modelo: {total_params * 4 / 1e9:.2f} GB")

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    print("INICIANDO ENTRENAMIENTO DE ESTRÉS")
    print("Abre otra terminal y ejecuta: docker stats stress-ai-lab")
    print("=" * 60)

    for epoch in range(EPOCHS):
        epoch_loss = 0.0
        print(f"\nEpoch {epoch + 1}/{EPOCHS}")

        for batch_idx, (data, target) in enumerate(dataloader):
            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()

            if batch_idx % 2 == 0:
                mem = psutil.Process().memory_info()
                print(f"Batch {batch_idx}: Loss={loss.item():.4f}")
                print(f"RAM Proceso: {mem.rss / 1e9:.2f} GB")
                print(f"RAM Sistema: {psutil.virtual_memory().percent}%")
                print(f"CPU Sistema: {psutil.cpu_percent()}%")

            monitor.snapshot()

        print(f"Epoch {epoch + 1} completado - Loss promedio: {epoch_loss / len(dataloader):.4f}")

    print("\nENTRENAMIENTO FINALIZADO")
    monitor.plot()


if __name__ == "__main__":
    train()
