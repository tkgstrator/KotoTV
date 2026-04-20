-- CreateEnum
CREATE TYPE "RuleEncodeCodec" AS ENUM ('avc', 'hevc', 'vp9');

-- CreateEnum
CREATE TYPE "RuleEncodeQuality" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "RuleEncodeTiming" AS ENUM ('immediate', 'idle');

-- AlterTable
ALTER TABLE "recording_rules" ADD COLUMN     "exclude_reruns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keep_latest_n" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "margin_end_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "margin_start_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "min_duration_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "new_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "post_encode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "post_encode_codec" "RuleEncodeCodec" NOT NULL DEFAULT 'avc',
ADD COLUMN     "post_encode_quality" "RuleEncodeQuality" NOT NULL DEFAULT 'medium',
ADD COLUMN     "post_encode_timing" "RuleEncodeTiming" NOT NULL DEFAULT 'immediate';
