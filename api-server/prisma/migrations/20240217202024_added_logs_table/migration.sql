-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "deployement_id" TEXT NOT NULL,
    "log_message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_deployement_id_fkey" FOREIGN KEY ("deployement_id") REFERENCES "Deployement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
