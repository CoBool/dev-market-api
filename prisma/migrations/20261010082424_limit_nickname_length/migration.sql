/*
  Warnings:

  - You are about to alter the column `nickname` on the `User` table. The data in that column could be lost. The data in that column will be cast from `VarChar(20)` to `VarChar(10)`.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "nickname" SET DATA TYPE VARCHAR(10);
