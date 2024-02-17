/*
  Warnings:

  - Added the required column `type` to the `Log` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "type" TEXT NOT NULL;
