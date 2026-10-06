-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "mescladoEmId" TEXT;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_mescladoEmId_fkey" FOREIGN KEY ("mescladoEmId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
