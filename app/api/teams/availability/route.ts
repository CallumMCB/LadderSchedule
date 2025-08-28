import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

function mondayStart(dateISO: string) {
  console.log('API: Received dateISO:', dateISO);
  const d = new Date(dateISO);
  console.log('API: Parsed date:', d);
  console.log('API: Day of week:', d.getDay(), '(0=Sunday, 1=Monday, etc)');
  const day = (d.getDay() + 6) % 7; // 0=Mon
  console.log('API: Days to subtract:', day);
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  console.log('API: Computed week start:', d);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStartISO = searchParams.get("weekStart");
  const ladderId = searchParams.get("ladderId");
  if (!weekStartISO) return NextResponse.json({ error: "weekStart required" }, { status: 400 });

  const weekStart = mondayStart(weekStartISO);

  try {
    // Clean up availability for past times (delete proposals older than current time)
    const now = new Date();
    await prisma.availability.deleteMany({
      where: {
        weekStart,
        startAt: { lt: now }
      }
    });

    // Get all users with their partners and availability (filter by ladder if provided)
    const userWhere = ladderId ? { ladderId } : {};
    const users = await prisma.user.findMany({
      where: userWhere,
      include: {
        partner: {
          select: { id: true, email: true, name: true }
        },
        availability: {
          where: { weekStart },
          select: { startAt: true, setByUserId: true }
        }
      }
    });

    // Also get all users in the ladder even if they have no availability for this week
    // This ensures newly migrated users show up as teams
    const allLadderUsers = ladderId ? await prisma.user.findMany({
      where: { ladderId },
      include: {
        partner: {
          select: { id: true, email: true, name: true }
        }
      }
    }) : [];

    // Merge users - prioritize those with availability, but include all ladder users
    const userMap = new Map();
    
    // First add users with availability
    users.forEach(user => {
      userMap.set(user.id, user);
    });
    
    // Then add any missing ladder users without availability
    allLadderUsers.forEach(user => {
      if (!userMap.has(user.id)) {
        userMap.set(user.id, {
          ...user,
          availability: [] // No availability for this week
        });
      }
    });
    
    const mergedUsers = Array.from(userMap.values());

    // Get confirmed matches for this week (filter by ladder if provided)
    console.log('Looking for matches between:', weekStart, 'and', new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000));
    console.log('Ladder filter:', ladderId);
    const matchWhere: any = {
      startAt: {
        gte: weekStart,
        lt: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000) // end of week
      },
      confirmed: true
    };
    if (ladderId) {
      matchWhere.ladderId = ladderId;
    }
    console.log('Match query:', matchWhere);
    const matches = await prisma.match.findMany({
      where: matchWhere
    });
    console.log('Found matches:', matches.length, matches.map(m => ({
      id: m.id,
      startAt: m.startAt.toISOString(),
      team1Id: m.team1Id,
      team2Id: m.team2Id,
      ladderId: m.ladderId,
      confirmed: m.confirmed
    })));

    // Build teams (avoid duplicates)
    const teams: Array<{
      id: string;
      member1: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      member2?: { id: string; email: string; name?: string; availability: string[]; setByUserIds: string[] };
      color: string;
    }> = [];

    const processedUsers = new Set<string>();
    const teamColors = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
      '#F97316', '#06B6D4', '#84CC16', '#EC4899', '#6366F1'
    ];

    let colorIndex = 0;

    mergedUsers.forEach(user => {
      if (processedUsers.has(user.id)) return;

      const userAvailability = user.availability.map((a: any) => a.startAt.toISOString());
      const userSetByUserIds = user.availability.map((a: any) => a.setByUserId || user.id);
      
      if (user.partner) {
        // This is a team
        const partner = mergedUsers.find(u => u.id === user.partnerId);
        if (partner && !processedUsers.has(partner.id)) {
          const partnerAvailability = partner.availability.map((a: any) => a.startAt.toISOString());
          const partnerSetByUserIds = partner.availability.map((a: any) => a.setByUserId || partner.id);
          
          teams.push({
            id: [user.id, partner.id].sort().join('-'),
            member1: {
              id: user.id,
              email: user.email,
              name: user.name,
              availability: userAvailability,
              setByUserIds: userSetByUserIds
            },
            member2: {
              id: partner.id,
              email: partner.email,
              name: partner.name,
              availability: partnerAvailability,
              setByUserIds: partnerSetByUserIds
            },
            color: teamColors[colorIndex % teamColors.length]
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
            name: user.name,
            availability: userAvailability,
            setByUserIds: userSetByUserIds
          },
          member2: {
            id: user.id,
            email: user.email,
            name: user.name,
            availability: userAvailability, // Same availability for both rows
            setByUserIds: userSetByUserIds
          },
          color: teamColors[colorIndex % teamColors.length]
        });
        
        processedUsers.add(user.id);
        colorIndex++;
      }
    });

    // Find current user's team (always look for current user, regardless of ladder filter)
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, partnerId: true, ladderId: true }
    });
    
    let myTeamId = undefined;
    if (currentUser) {
      myTeamId = currentUser.partnerId 
        ? [currentUser.id, currentUser.partnerId].sort().join('-')
        : currentUser.id;
        
      // Only show schedule button if current user is in the same ladder as the filtered teams
      if (ladderId && currentUser.ladderId !== ladderId) {
        myTeamId = undefined; // Hide schedule button when viewing other ladders
      }
    }

    return NextResponse.json({ 
      teams,
      myTeamId,
      currentUserId: currentUser?.id,
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
    console.error("Error fetching teams availability:", error);
    return NextResponse.json({ error: "Failed to fetch teams availability" }, { status: 500 });
  }
}