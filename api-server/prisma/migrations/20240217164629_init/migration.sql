-- CreateEnum
CREATE TYPE "DeployementStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'READY', 'FAIL');

-- CreateTable
CREATE TABLE "Deployement" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "git_url" TEXT NOT NULL,
    "status" "DeployementStatus" NOT NULL DEFAULT 'QUEUED',
    "user_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployement_pkey" PRIMARY KEY ("id")
);
