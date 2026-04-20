-- CreateEnum
CREATE TYPE "EncodeMode" AS ENUM ('simple', 'advanced');

-- AlterTable
ALTER TABLE "encode_profiles" ADD COLUMN     "bitrate_kbps" INTEGER NOT NULL DEFAULT 4000,
ADD COLUMN     "mode" "EncodeMode" NOT NULL DEFAULT 'simple',
ADD COLUMN     "qp_value" INTEGER NOT NULL DEFAULT 23;
