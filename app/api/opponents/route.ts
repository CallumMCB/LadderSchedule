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
    // Get current user to determine their ladder
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { ladderId: true }
    });

    if (!currentUser?.ladderId) {
      return NextResponse.json({ error: "User not assigned to a ladder" }, { status: 400 });
    }

    // Use provided ladderId or fall back to current user's ladder
    const targetLadderId = ladderId || currentUser.ladderId;

    // Get all users in the same ladder with their partners
    const users = await prisma.user.findMany({
      where: { ladderId: targetLadderId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        partnerId: true,
        partner: {
          select: { id: true, email: true, name: true, phone: true }
        }
      }
    });

    // Build teams (avoid duplicates)
    const teams: Array<{
      id: string;
      member1: { id: string; email: string; name?: string; phone?: string };
      member2?: { id: string; email: string; name?: string; phone?: string };
      color: string;
      isComplete?: boolean;
      lookingForPartner?: boolean;
    }> = [];

    const processedUsers = new Set<string>();
    const teamColors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
      '#F97316', '#06B6D4', '#84CC16', '#EC4899', '#6366F1'
    ];

    let colorIndex = 0;

    users.forEach(user => {
      if (processedUsers.has(user.id)) return;

      if (user.partner) {
        // This is a team
        const partner = users.find(u => u.id === user.partnerId);
        if (partner && !processedUsers.has(partner.id)) {
          teams.push({
            id: [user.id, partner.id].sort().join('-'),
            member1: {
              id: user.id,
              email: user.email,
              name: user.name || undefined,
              phone: user.phone || undefined
            },
            member2: {
              id: partner.id,
              email: partner.email,
              name: partner.name || undefined,
              phone: partner.phone || undefined
            },
            color: teamColors[colorIndex % teamColors.length],
            isComplete: true
          });
          
          processedUsers.add(user.id);
          processedUsers.add(partner.id);
          colorIndex++;
        }
      } else {
        // Solo player (fills both rows until partner joins)
        teams.push({
          id: user.id,
          member1: {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            phone: user.phone || undefined
          },
          member2: {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            phone: user.phone || undefined
          },
          color: teamColors[colorIndex % teamColors.length],
          isComplete: false,
          lookingForPartner: true
        });
        
        processedUsers.add(user.id);
        colorIndex++;
      }
    });

    // Find current user's team
    const sessionCurrentUser = users.find(u => u.email === session.user?.email);
    const myTeamId = sessionCurrentUser?.partner 
      ? [sessionCurrentUser.id, sessionCurrentUser.partnerId!].sort().join('-')
      : sessionCurrentUser?.id;

    return NextResponse.json({ 
      teams,
      myTeamId
    });

  } catch (error) {
    console.error("Error fetching opponents:", error);
    return NextResponse.json({ error: "Failed to fetch opponents" }, { status: 500 });
  }
}