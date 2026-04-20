-- CreateEnum
CREATE TYPE "RateControl" AS ENUM ('cbr', 'vbr', 'cqp');

-- AlterTable
ALTER TABLE "encode_profiles" ADD COLUMN     "rate_control" "RateControl" NOT NULL DEFAULT 'vbr';
