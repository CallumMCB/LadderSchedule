import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { matchId } = await req.json();
    
    if (!matchId) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }

    const currentUser = await prisma.user.findUnique({ 
      where: { email: session.user.email },
      include: { partner: true }
    });
    
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build my team ID
    const myTeamId = currentUser.partner ? 
      [currentUser.id, currentUser.partnerId!].sort().join('-') : 
      currentUser.id;

    // Find the match and verify the user is part of one of the teams
    const match = await prisma.match.findUnique({
      where: { id: matchId }
    });

    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Check if the current user is part of either team in the match
    if (match.team1Id !== myTeamId && match.team2Id !== myTeamId) {
      return NextResponse.json({ error: "You can only cancel matches involving your team" }, { status: 403 });
    }
    
    // Delete the match
    await prisma.match.delete({
      where: { id: matchId }
    });

    return NextResponse.json({ 
      success: true,
      message: "Match cancelled successfully" 
    });
    
  } catch (error) {
    console.error("Match cancellation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}