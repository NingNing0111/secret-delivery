-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SecretStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "status" "SecretStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT NOT NULL,
    "batchIndex" INTEGER NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Secret_maxViews_check" CHECK ("maxViews" IS NULL OR "maxViews" > 0),
    CONSTRAINT "Secret_viewCount_check" CHECK ("viewCount" >= 0),
    CONSTRAINT "Secret_batchIndex_check" CHECK ("batchIndex" >= 0)
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Secret_token_key" ON "Secret"("token");

-- CreateIndex
CREATE INDEX "Secret_createdAt_id_idx" ON "Secret"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Secret_status_idx" ON "Secret"("status");

-- CreateIndex
CREATE INDEX "Secret_expiresAt_idx" ON "Secret"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Secret_batchId_batchIndex_key" ON "Secret"("batchId", "batchIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

