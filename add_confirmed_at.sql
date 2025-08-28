-- Add missing confirmedAt column to Match table
ALTER TABLE "Match" ADD COLUMN "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;