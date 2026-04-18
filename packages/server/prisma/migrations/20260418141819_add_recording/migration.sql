-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('pending', 'recording', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('recording', 'completed', 'failed');

-- CreateTable
CREATE TABLE "recording_schedules" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "file_path" TEXT,
    "size_bytes" BIGINT,
    "duration_sec" INTEGER,
    "thumbnail_url" TEXT,
    "status" "RecordingStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recording_schedules_status_start_at_idx" ON "recording_schedules"("status", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_schedule_id_key" ON "recordings"("schedule_id");

-- CreateIndex
CREATE INDEX "recordings_status_started_at_idx" ON "recordings"("status", "started_at");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recording_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
