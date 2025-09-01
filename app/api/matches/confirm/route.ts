import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMatchConfirmationEmail } from "@/lib/email";

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
        existingMatch: {
          id: existingMatch.id,
          startAt: existingMatch.startAt.toISOString(),
          team1Id: existingMatch.team1Id,
          team2Id: existingMatch.team2Id
        },
        requestedTime: slotKey,
        message: "A match already exists with this team. Would you like to reschedule?"
      }, { status: 409 }); // 409 = Conflict
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

    // Send confirmation email to all team members (async, don't wait)
    sendMatchConfirmationEmail({
      id: match.id,
      startAt: match.startAt,
      team1Id: match.team1Id,
      team2Id: match.team2Id
    }).catch(error => {
      console.error('Failed to send match confirmation email:', error);
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