-- Migration to add notification preferences to User table
-- Run this in your Supabase SQL Editor

-- Add the new notification preference columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveUpdates" BOOLEAN DEFAULT TRUE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveMatchNotifications" BOOLEAN DEFAULT TRUE; 
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "receiveMarketing" BOOLEAN DEFAULT FALSE;

-- Add email verification columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationExpiry" TIMESTAMPTZ;

-- Add comments to document the columns
COMMENT ON COLUMN "User"."receiveUpdates" IS 'Receive updates about the tennis ladder';
COMMENT ON COLUMN "User"."receiveMatchNotifications" IS 'Receive match notifications and reminders';
COMMENT ON COLUMN "User"."receiveMarketing" IS 'Receive occasional marketing/info emails';
COMMENT ON COLUMN "User"."emailVerified" IS 'Whether the email has been verified';
COMMENT ON COLUMN "User"."emailVerificationToken" IS 'Token for email verification';
COMMENT ON COLUMN "User"."emailVerificationExpiry" IS 'Expiry time for email verification token';

-- Set default values for existing users (if any exist)
UPDATE "User" 
SET 
  "receiveUpdates" = TRUE,
  "receiveMatchNotifications" = TRUE,
  "receiveMarketing" = FALSE,
  "emailVerified" = TRUE  -- Existing users should be considered verified
WHERE 
  "receiveUpdates" IS NULL 
  OR "receiveMatchNotifications" IS NULL 
  OR "receiveMarketing" IS NULL
  OR "emailVerified" IS NULL;

-- Verify the changes
SELECT 
    id,
    email,
    name,
    "receiveUpdates",
    "receiveMatchNotifications", 
    "receiveMarketing",
    "emailVerified",
    "emailVerificationToken",
    "emailVerificationExpiry",
    "createdAt"
FROM "User" 
ORDER BY "createdAt" DESC
LIMIT 10;