import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { matchId, newTime } = await req.json();
    
    if (!matchId || !newTime) {
      return NextResponse.json({ error: "matchId and newTime required" }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({ 
      where: { email: session.user.email }
    });
    
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find the existing match
    const existingMatch = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!existingMatch) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Verify the user is part of this match
    const myTeamId = currentUser.partnerId ? 
      [currentUser.id, currentUser.partnerId!].sort().join('-') : 
      currentUser.id;

    if (existingMatch.team1Id !== myTeamId && existingMatch.team2Id !== myTeamId) {
      return NextResponse.json({ error: "Not authorized to reschedule this match" }, { status: 403 });
    }

    // Update the match time
    const updatedMatch = await prisma.match.update({
      where: { id: matchId },
      data: {
        startAt: new Date(newTime)
      }
    });

    return NextResponse.json({ 
      success: true,
      message: "Match rescheduled successfully!",
      match: {
        id: updatedMatch.id,
        startAt: updatedMatch.startAt.toISOString(),
        team1Id: updatedMatch.team1Id,
        team2Id: updatedMatch.team2Id
      }
    });
    
  } catch (error) {
    console.error("Match reschedule error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}