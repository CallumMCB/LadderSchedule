import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { slotKey, opponentTeamId } = await req.json();
    
    if (!slotKey || !opponentTeamId) {
      return NextResponse.json({ error: "slotKey and opponentTeamId required" }, { status: 400 });
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

    // Sort team IDs for consistency
    const [team1Id, team2Id] = [myTeamId, opponentTeamId].sort();
    
    // Check if there's already a confirmed match between these teams in this ladder
    const existingMatch = await prisma.match.findFirst({
      where: {
        team1Id,
        team2Id,
        confirmed: true,
        ladderId: currentUser.ladderId
      }
    });
    
    if (existingMatch) {
      return NextResponse.json({ 
        error: "You can only have one match with the same team until the ladder is reset" 
      }, { status: 400 });
    }
    
    // Create the match record
    const match = await prisma.match.create({
      data: {
        startAt: new Date(slotKey),
        team1Id,
        team2Id,
        confirmed: true,
        ladderId: currentUser.ladderId
      }
    });

    return NextResponse.json({ 
      success: true,
      message: "Match confirmed!",
      match: {
        id: match.id,
        startAt: match.startAt.toISOString(),
        team1Id: match.team1Id,
        team2Id: match.team2Id
      }
    });
    
  } catch (error) {
    console.error("Match confirmation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}