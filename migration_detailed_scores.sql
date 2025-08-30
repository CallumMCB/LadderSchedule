-- Add detailed score columns to Match table
ALTER TABLE "Match" ADD COLUMN "team1DetailedScore" TEXT;
ALTER TABLE "Match" ADD COLUMN "team2DetailedScore" TEXT;

-- Add comments to describe the new columns
COMMENT ON COLUMN "Match"."team1DetailedScore" IS 'Detailed set scores (e.g., "6,4,X")';
COMMENT ON COLUMN "Match"."team2DetailedScore" IS 'Detailed set scores (e.g., "3,6,X")';