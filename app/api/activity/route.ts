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
    
    // Parse team IDs to get individual user IDs
    const allUserIds = new Set<string>();
    uniqueTeamIds.forEach(teamId => {
      if (teamId.includes('-')) {
        // Partnered team: split by '-' to get both user IDs
        const [user1Id, user2Id] = teamId.split('-');
        allUserIds.add(user1Id);
        allUserIds.add(user2Id);
      } else {
        // Solo player: teamId is the user ID
        allUserIds.add(teamId);
      }
    });

    // Get users for all involved user IDs
    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(allUserIds) } },
      select: { id: true, name: true, email: true, partnerId: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Helper function to get team display name from team ID
    const getTeamDisplayName = (teamId: string): string => {
      if (teamId.includes('-')) {
        // Partnered team
        const [user1Id, user2Id] = teamId.split('-');
        const user1 = userMap.get(user1Id);
        const user2 = userMap.get(user2Id);
        const name1 = user1 ? (user1.name || user1.email.split('@')[0]) : 'Unknown';
        const name2 = user2 ? (user2.name || user2.email.split('@')[0]) : 'Unknown';
        return `${name1} & ${name2}`;
      } else {
        // Solo player
        const user = userMap.get(teamId);
        const name = user ? (user.name || user.email.split('@')[0]) : 'Unknown';
        return `${name} (solo)`;
      }
    };

    // Format activity items
    const activities = recentMatches.map(match => {
      return {
        type: 'match',
        timestamp: match.createdAt,
        team1: getTeamDisplayName(match.team1Id),
        team2: getTeamDisplayName(match.team2Id),
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