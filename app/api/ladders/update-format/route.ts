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
    
    // Use transaction to ensure all updates succeed or fail together
    const updateResults = await prisma.$transaction(async (tx) => {
      const results = [];
      
      for (const match of matches) {
        // Only process matches that have scores
        if (!match.team1DetailedScore && !match.team2DetailedScore) {
          continue;
        }

        console.log(`Processing match ${match.id}: ${match.team1DetailedScore} vs ${match.team2DetailedScore}`);
        
        let team1Updated = match.team1DetailedScore || '';
        let team2Updated = match.team2DetailedScore || '';
        let needsUpdate = false;

        // Handle set-based scores (comma-separated)
        if (team1Updated.includes(',') || team2Updated.includes(',')) {
          const team1Sets = team1Updated.split(',').map(s => s.trim());
          const team2Sets = team2Updated.split(',').map(s => s.trim());
          const currentSets = Math.max(team1Sets.length, team2Sets.length);

          console.log(`Current sets: Team1 [${team1Sets.join(',')}] vs Team2 [${team2Sets.join(',')}]`);

          if (newSets !== currentSets) {
            needsUpdate = true;
            
            if (newSets < currentSets) {
              // Shorten to new number of sets
              team1Updated = team1Sets.slice(0, newSets).join(',');
              team2Updated = team2Sets.slice(0, newSets).join(',');
              console.log(`Shortened to: ${team1Updated} vs ${team2Updated}`);
            } else {
              // Extend with X for unplayed sets
              const additionalSets = newSets - currentSets;
              const newEmptySets = Array(additionalSets).fill('X');
              
              team1Updated = [...team1Sets, ...newEmptySets].join(',');
              team2Updated = [...team2Sets, ...newEmptySets].join(',');
              console.log(`Extended to: ${team1Updated} vs ${team2Updated}`);
            }
          }
        } else if (newSets > 1 && (team1Updated || team2Updated)) {
          // Convert single scores to multi-set format
          needsUpdate = true;
          const additionalSets = newSets - 1;
          const newEmptySets = Array(additionalSets).fill('X');
          
          team1Updated = [team1Updated, ...newEmptySets].join(',');
          team2Updated = [team2Updated, ...newEmptySets].join(',');
          console.log(`Converted single to multi-set: ${team1Updated} vs ${team2Updated}`);
        }

        // Only update if changes are needed
        if (needsUpdate) {
          const updatedMatch = await tx.match.update({
            where: { id: match.id },
            data: {
              team1DetailedScore: team1Updated,
              team2DetailedScore: team2Updated
            }
          });
          
          results.push({
            matchId: match.id,
            old: { team1: match.team1DetailedScore, team2: match.team2DetailedScore },
            new: { team1: updatedMatch.team1DetailedScore, team2: updatedMatch.team2DetailedScore }
          });
          
          console.log(`Updated match ${match.id} in database:`, {
            old: { team1: match.team1DetailedScore, team2: match.team2DetailedScore },
            new: { team1: updatedMatch.team1DetailedScore, team2: updatedMatch.team2DetailedScore }
          });
        }
      }
      
      return results;
    });

    updatedMatchCount = updateResults.length;

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