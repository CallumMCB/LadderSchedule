-- Migration to add notification preferences to User table
-- Run this in your Supabase SQL Editor

-- Add the new notification preference columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveUpdates" BOOLEAN DEFAULT TRUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveMatchNotifications" BOOLEAN DEFAULT TRUE; 
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveMarketing" BOOLEAN DEFAULT FALSE;

-- Add comments to document the columns
COMMENT ON COLUMN "User"."receiveUpdates" IS 'Receive updates about the tennis ladder';
COMMENT ON COLUMN "User"."receiveMatchNotifications" IS 'Receive match notifications and reminders';
COMMENT ON COLUMN "User"."receiveMarketing" IS 'Receive occasional marketing/info emails';

-- Set default values for existing users (if any exist)
UPDATE "User" 
SET 
  "receiveUpdates" = TRUE,
  "receiveMatchNotifications" = TRUE,
  "receiveMarketing" = FALSE
WHERE 
  "receiveUpdates" IS NULL 
  OR "receiveMatchNotifications" IS NULL 
  OR "receiveMarketing" IS NULL;

-- Verify the changes
SELECT 
    id,
    email,
    name,
    "receiveUpdates",
    "receiveMatchNotifications", 
    "receiveMarketing",
    "createdAt"
FROM "User" 
ORDER BY "createdAt" DESC
LIMIT 10;