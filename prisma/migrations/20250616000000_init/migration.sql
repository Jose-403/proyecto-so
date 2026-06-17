-- CreateTable
CREATE TABLE "stress_logs" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stress_type" TEXT NOT NULL,
    "intensity" DOUBLE PRECISION NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics_snapshots" (
    "id" SERIAL NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL,
    "ram_used_mb" DOUBLE PRECISION NOT NULL,
    "active_connections" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stress_data" (
    "id" SERIAL NOT NULL,
    "payload" TEXT NOT NULL,
    "random_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stress_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stress_data_random_number_idx" ON "stress_data"("random_number");
