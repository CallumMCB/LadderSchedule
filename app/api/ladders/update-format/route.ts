import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { ladderId, newMatchFormat } = await request.json();

    if (!ladderId || !newMatchFormat) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update the ladder format
    const updatedLadder = await prisma.ladder.update({
      where: { id: ladderId },
      data: { matchFormat: newMatchFormat }
    });

    // Get all matches for this ladder
    const matches = await prisma.match.findMany({
      where: { ladderId: ladderId }
    });

    // Update existing match scores based on new format
    const newSets = newMatchFormat.sets;
    
    for (const match of matches) {
      if (match.team1DetailedScore || match.team2DetailedScore) {
        let team1Updated = match.team1DetailedScore || '';
        let team2Updated = match.team2DetailedScore || '';

        if (team1Updated.includes(',') || team2Updated.includes(',')) {
          // Handle set-based scores
          const team1Sets = team1Updated.split(',').map(s => s.trim());
          const team2Sets = team2Updated.split(',').map(s => s.trim());

          if (newSets < team1Sets.length) {
            // Shorten to new number of sets
            team1Updated = team1Sets.slice(0, newSets).join(',');
            team2Updated = team2Sets.slice(0, newSets).join(',');
          } else if (newSets > team1Sets.length) {
            // Extend with X for unplayed sets
            const currentSets = team1Sets.length;
            const additionalSets = newSets - currentSets;
            const newEmptySets = Array(additionalSets).fill('X');
            
            team1Updated = [...team1Sets, ...newEmptySets].join(',');
            team2Updated = [...team2Sets, ...newEmptySets].join(',');
          }

          // Update the match in database
          await prisma.match.update({
            where: { id: match.id },
            data: {
              team1DetailedScore: team1Updated,
              team2DetailedScore: team2Updated
            }
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      ladder: updatedLadder,
      updatedMatches: matches.length 
    });

  } catch (error) {
    console.error("Error updating ladder format:", error);
    return NextResponse.json({ error: "Failed to update ladder format" }, { status: 500 });
  }
}