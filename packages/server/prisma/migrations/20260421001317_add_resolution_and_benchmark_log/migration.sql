-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('hd1080', 'hd720', 'sd480');

-- AlterTable
ALTER TABLE "encode_profiles" ADD COLUMN     "keep_original_resolution" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "resolution" "Resolution" NOT NULL DEFAULT 'hd720';

-- CreateTable
CREATE TABLE "benchmark_logs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codec" "RuleEncodeCodec" NOT NULL,
    "hw_accel" "HwAccelType" NOT NULL,
    "rate_control" "RateControl" NOT NULL,
    "bitrate_kbps" INTEGER NOT NULL,
    "qp_value" INTEGER NOT NULL,
    "keep_original_resolution" BOOLEAN NOT NULL,
    "resolution" "Resolution" NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "fps" DOUBLE PRECISION NOT NULL,
    "wall_seconds" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,

    CONSTRAINT "benchmark_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "benchmark_logs_created_at_idx" ON "benchmark_logs"("created_at");
