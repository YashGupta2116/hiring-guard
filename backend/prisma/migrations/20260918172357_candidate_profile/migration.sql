-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEWING', 'HIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "appliedRole" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "experienceYears" INTEGER,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "skills" TEXT[],
ADD COLUMN     "status" "CandidateStatus" NOT NULL DEFAULT 'UNDER_REVIEW';

-- CreateIndex
CREATE INDEX "candidates_orgId_status_idx" ON "candidates"("orgId", "status");
