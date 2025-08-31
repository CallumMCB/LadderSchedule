-- Migration to ensure ladder hierarchy and proper ordering
-- Run this in your Supabase SQL Editor

-- First, check if the number column exists and has proper constraints
-- If you need to add the number column (it should already exist from Prisma schema):
-- ALTER TABLE "Ladder" ADD COLUMN "number" INTEGER;

-- Ensure the number column is unique (should already be set from Prisma)
-- ALTER TABLE "Ladder" ADD CONSTRAINT "Ladder_number_key" UNIQUE ("number");

-- Update existing ladders to have proper numbering if they don't already
-- This will assign numbers based on creation order (oldest = Ladder 1)
UPDATE "Ladder" 
SET "number" = subquery.row_number
FROM (
    SELECT 
        id,
        ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) as row_number
    FROM "Ladder" 
    WHERE "number" IS NULL OR "number" = 0
) AS subquery
WHERE "Ladder".id = subquery.id;

-- Ensure all ladders have isActive = true by default if not set
UPDATE "Ladder" 
SET "isActive" = true 
WHERE "isActive" IS NULL;

-- Create an index on the number column for better performance
CREATE INDEX IF NOT EXISTS "Ladder_number_idx" ON "Ladder" ("number");

-- Verify the ladder hierarchy
SELECT 
    id,
    name,
    number,
    "endDate",
    "isActive",
    "createdAt"
FROM "Ladder" 
ORDER BY "number" ASC;

-- Optional: If you want to rename ladders to follow a consistent pattern
-- UPDATE "Ladder" SET name = 'Ladder ' || "number"::text WHERE name NOT LIKE 'Ladder %';