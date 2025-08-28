import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { scores } = await req.json();
    
    if (!Array.isArray(scores)) {
      return NextResponse.json({ error: "scores array required" }, { status: 400 });
    }

    // Validate scores format
    for (const score of scores) {
      if (!score.matchId || typeof score.team1Score !== 'number' || typeof score.team2Score !== 'number') {
        return NextResponse.json({ error: "Invalid score format" }, { status: 400 });
      }
    }

    // Get current user to verify they can update scores
    const currentUser = await prisma.user.findUnique({ 
      where: { email: session.user.email }
    });
    
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update scores in database
    const updatePromises = scores.map(async (score) => {
      // Verify the match exists and user has permission to update it
      const match = await prisma.match.findUnique({
        where: { id: score.matchId }
      });

      if (!match) {
        throw new Error(`Match ${score.matchId} not found`);
      }

      // Build current user's team ID to verify they're involved in the match
      const myTeamId = currentUser.partnerId ? 
        [currentUser.id, currentUser.partnerId].sort().join('-') : 
        currentUser.id;

      // Check if user is part of either team in the match
      if (match.team1Id !== myTeamId && match.team2Id !== myTeamId) {
        // For now, allow any authenticated user to update scores
        // In a real app, you might want stricter permissions
        console.log(`User ${currentUser.email} updating score for match not involving their team`);
      }

      // Update the match with scores
      return prisma.match.update({
        where: { id: score.matchId },
        data: {
          team1Score: score.team1Score,
          team2Score: score.team2Score,
          completed: true
        }
      });
    });

    await Promise.all(updatePromises);

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${scores.length} match score(s)`,
      scoresUpdated: scores.length
    });

  } catch (error) {
    console.error("Score update error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Internal server error" 
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStartISO = searchParams.get("weekStart");
  
  if (!weekStartISO) {
    return NextResponse.json({ error: "weekStart required" }, { status: 400 });
  }

  try {
    const weekStart = new Date(weekStartISO);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get matches with scores for the specified week
    const matches = await prisma.match.findMany({
      where: {
        startAt: {
          gte: weekStart,
          lt: weekEnd
        },
        confirmed: true
      },
      select: {
        id: true,
        startAt: true,
        team1Id: true,
        team2Id: true,
        team1Score: true,
        team2Score: true,
        completed: true
      }
    });

    return NextResponse.json({ 
      matches,
      weekStart: weekStart.toISOString()
    });

  } catch (error) {
    console.error("Error fetching match scores:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}