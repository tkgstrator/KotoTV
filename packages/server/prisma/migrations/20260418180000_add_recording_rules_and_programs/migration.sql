-- CreateEnum
CREATE TYPE "RuleKeywordMode" AS ENUM ('literal', 'regex');

-- CreateEnum
CREATE TYPE "RuleKeywordTarget" AS ENUM ('title', 'title_description');

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "keyword" TEXT,
    "keyword_mode" "RuleKeywordMode" NOT NULL DEFAULT 'literal',
    "keyword_target" "RuleKeywordTarget" NOT NULL DEFAULT 'title',
    "exclude_keyword" TEXT,
    "channel_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "day_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "time_start_minutes" INTEGER,
    "time_end_minutes" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "avoid_duplicates" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recording_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add ruleId and failureReason to recording_schedules
ALTER TABLE "recording_schedules" ADD COLUMN "rule_id" TEXT,
                                  ADD COLUMN "failure_reason" TEXT;

-- CreateIndex
CREATE INDEX "programs_channel_id_start_at_idx" ON "programs"("channel_id", "start_at");

-- CreateIndex
CREATE INDEX "programs_start_at_end_at_idx" ON "programs"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "programs_title_idx" ON "programs"("title");

-- CreateIndex
CREATE INDEX "recording_rules_enabled_idx" ON "recording_rules"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "recording_schedules_rule_id_program_id_key" ON "recording_schedules"("rule_id", "program_id");

-- CreateIndex
CREATE INDEX "recording_schedules_rule_id_idx" ON "recording_schedules"("rule_id");

-- AddForeignKey
ALTER TABLE "recording_schedules" ADD CONSTRAINT "recording_schedules_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recording_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
