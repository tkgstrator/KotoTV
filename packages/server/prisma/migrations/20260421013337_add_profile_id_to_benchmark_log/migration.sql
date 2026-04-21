-- AlterTable
ALTER TABLE "benchmark_logs" ADD COLUMN     "profile_id" TEXT;

-- CreateIndex
CREATE INDEX "benchmark_logs_profile_id_idx" ON "benchmark_logs"("profile_id");

-- AddForeignKey
ALTER TABLE "benchmark_logs" ADD CONSTRAINT "benchmark_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "encode_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
