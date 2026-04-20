/*
  Warnings:

  - You are about to drop the column `post_encode` on the `recording_rules` table. All the data in the column will be lost.
  - You are about to drop the column `post_encode_codec` on the `recording_rules` table. All the data in the column will be lost.
  - You are about to drop the column `post_encode_quality` on the `recording_rules` table. All the data in the column will be lost.
  - You are about to drop the column `post_encode_timing` on the `recording_rules` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "HwAccelType" AS ENUM ('cpu', 'nvenc', 'vaapi');

-- AlterTable
ALTER TABLE "recording_rules" DROP COLUMN "post_encode",
DROP COLUMN "post_encode_codec",
DROP COLUMN "post_encode_quality",
DROP COLUMN "post_encode_timing",
ADD COLUMN     "encode_profile_id" TEXT;

-- AlterTable
ALTER TABLE "recording_schedules" ADD COLUMN     "encode_profile_id" TEXT;

-- CreateTable
CREATE TABLE "encode_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codec" "RuleEncodeCodec" NOT NULL DEFAULT 'avc',
    "quality" "RuleEncodeQuality" NOT NULL DEFAULT 'medium',
    "timing" "RuleEncodeTiming" NOT NULL DEFAULT 'immediate',
    "hw_accel" "HwAccelType" NOT NULL DEFAULT 'cpu',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encode_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "encode_profiles_name_key" ON "encode_profiles"("name");

-- CreateIndex
CREATE INDEX "encode_profiles_is_default_idx" ON "encode_profiles"("is_default");

-- CreateIndex
CREATE INDEX "recording_rules_encode_profile_id_idx" ON "recording_rules"("encode_profile_id");

-- CreateIndex
CREATE INDEX "recording_schedules_encode_profile_id_idx" ON "recording_schedules"("encode_profile_id");

-- AddForeignKey
ALTER TABLE "recording_rules" ADD CONSTRAINT "recording_rules_encode_profile_id_fkey" FOREIGN KEY ("encode_profile_id") REFERENCES "encode_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_schedules" ADD CONSTRAINT "recording_schedules_encode_profile_id_fkey" FOREIGN KEY ("encode_profile_id") REFERENCES "encode_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
