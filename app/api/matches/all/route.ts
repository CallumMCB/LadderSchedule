import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ladderId = searchParams.get("ladderId");

  try {
    // Get all confirmed matches, ordered by date (filter by ladder if provided)
    const matchWhere: any = { confirmed: true };
    if (ladderId) {
      matchWhere.ladderId = ladderId;
    }
    const matches = await prisma.match.findMany({
      where: matchWhere,
      orderBy: {
        startAt: 'desc' // Most recent first
      }
    });

    return NextResponse.json({ 
      matches: matches.map(match => ({
        id: match.id,
        startAt: match.startAt.toISOString(),
        team1Id: match.team1Id,
        team2Id: match.team2Id,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        completed: match.completed
      }))
    });

  } catch (error) {
    console.error("Error fetching all matches:", error);
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 });
  }
}