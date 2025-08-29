import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const ladderId = searchParams.get("ladderId");
    
    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get recent matches (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentMatches = await prisma.match.findMany({
      where: {
        AND: [
          ladderId ? { ladderId } : {},
          { createdAt: { gte: sevenDaysAgo } }
        ]
      },
      include: {
        ladder: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 15
    });

    // Get user names for team IDs in matches
    const allTeamIds = [...recentMatches.map(m => m.team1Id), ...recentMatches.map(m => m.team2Id)];
    const uniqueTeamIds = Array.from(new Set(allTeamIds));
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueTeamIds } },
      select: { id: true, name: true, email: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Format activity items
    const activities = recentMatches.map(match => {
      const team1User = userMap.get(match.team1Id);
      const team2User = userMap.get(match.team2Id);
      return {
        type: 'match',
        timestamp: match.createdAt,
        team1: team1User ? (team1User.name || team1User.email) : match.team1Id,
        team2: team2User ? (team2User.name || team2User.email) : match.team2Id,
        slot: match.startAt.toISOString(),
        confirmed: match.confirmed,
        completed: match.completed,
        score: match.completed ? `${match.team1Score}-${match.team2Score}` : null
      };
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ activities });

  } catch (error) {
    console.error("Activity fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}