/*
  Warnings:

  - You are about to drop the column `motivoRejeicao` on the `Documento` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Documento" DROP COLUMN "motivoRejeicao",
ADD COLUMN     "motivo" TEXT;
