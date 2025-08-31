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
    console.log('Update format request:', { ladderId, newMatchFormat });

    if (!ladderId || !newMatchFormat) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Update the ladder format - ensure JSON field is properly handled
    const updatedLadder = await prisma.ladder.update({
      where: { id: ladderId },
      data: { matchFormat: newMatchFormat as any }
    });
    
    console.log('Updated ladder:', updatedLadder);

    // Get all matches for this ladder
    const matches = await prisma.match.findMany({
      where: { ladderId: ladderId }
    });

    console.log(`Found ${matches.length} matches to update`);

    // Update existing match scores based on new format
    const newSets = newMatchFormat.sets;
    let updatedMatchCount = 0;
    
    for (const match of matches) {
      if (match.team1DetailedScore || match.team2DetailedScore) {
        console.log(`Processing match ${match.id}: ${match.team1DetailedScore} vs ${match.team2DetailedScore}`);
        
        let team1Updated = match.team1DetailedScore || '';
        let team2Updated = match.team2DetailedScore || '';

        if (team1Updated.includes(',') || team2Updated.includes(',')) {
          // Handle set-based scores
          const team1Sets = team1Updated.split(',').map(s => s.trim());
          const team2Sets = team2Updated.split(',').map(s => s.trim());

          console.log(`Current sets: Team1 [${team1Sets.join(',')}] vs Team2 [${team2Sets.join(',')}]`);

          if (newSets < team1Sets.length) {
            // Shorten to new number of sets
            team1Updated = team1Sets.slice(0, newSets).join(',');
            team2Updated = team2Sets.slice(0, newSets).join(',');
            console.log(`Shortened to: ${team1Updated} vs ${team2Updated}`);
          } else if (newSets > team1Sets.length) {
            // Extend with X for unplayed sets
            const currentSets = team1Sets.length;
            const additionalSets = newSets - currentSets;
            const newEmptySets = Array(additionalSets).fill('X');
            
            team1Updated = [...team1Sets, ...newEmptySets].join(',');
            team2Updated = [...team2Sets, ...newEmptySets].join(',');
            console.log(`Extended to: ${team1Updated} vs ${team2Updated}`);
          }

          // Update the match in database
          const updatedMatch = await prisma.match.update({
            where: { id: match.id },
            data: {
              team1DetailedScore: team1Updated,
              team2DetailedScore: team2Updated
            }
          });
          
          updatedMatchCount++;
          console.log(`Updated match ${match.id} in database:`, {
            old: { team1: match.team1DetailedScore, team2: match.team2DetailedScore },
            new: { team1: updatedMatch.team1DetailedScore, team2: updatedMatch.team2DetailedScore }
          });
        } else if (newSets === 1 && (team1Updated || team2Updated)) {
          // Handle single score conversion to single set
          console.log(`Converting single scores: ${team1Updated} vs ${team2Updated}`);
          // Keep as is for single set format
          updatedMatchCount++;
        }
      }
    }

    console.log(`Successfully updated ${updatedMatchCount} matches`);
    
    return NextResponse.json({ 
      success: true, 
      ladder: updatedLadder,
      updatedMatches: updatedMatchCount 
    });

  } catch (error) {
    console.error("Error updating ladder format:", error);
    return NextResponse.json({ error: "Failed to update ladder format" }, { status: 500 });
  }
}