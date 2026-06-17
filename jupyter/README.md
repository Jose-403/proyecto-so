# Jupyter — Escenario 6.2 (entrenamiento IA)

Notebook oficial del profesor: **`training_ai_model.ipynb`**

## Uso en JupyterLab

1. Levantar el stack: `docker compose up -d`
2. Abrir http://localhost:8888 (token: `stress_lab_token`)
3. Abrir `training_ai_model.ipynb` y ejecutar las celdas en orden
4. En otra terminal: `docker stats stress-ai-lab`

## Uso por terminal (mismo flujo)

```bash
docker compose exec stress-ai-lab pip install -q -r /home/jovyan/work/requirements.txt
docker compose exec stress-ai-lab python /home/jovyan/work/entrenamiento_ia.py
```

## Ajuste de RAM

En el notebook, modifique `IMG_SIZE` según su equipo:

| RAM | img_size | batch_size |
|-----|----------|------------|
| 8 GB | 2000 | 1 |
| 16 GB | 3000 | 2 |
| 32 GB+ | 5000 | 1 |

Variables de entorno opcionales para el script:

```bash
STRESS_IMG_SIZE=2000 STRESS_EPOCHS=3 docker compose exec stress-ai-lab python /home/jovyan/work/entrenamiento_ia.py
```
