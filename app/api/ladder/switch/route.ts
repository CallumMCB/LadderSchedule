import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { newLadderId, confirmed } = await req.json();
    
    // Validate that the new ladder exists
    const newLadder = await prisma.ladder.findUnique({
      where: { id: newLadderId },
    });
    
    if (!newLadder || !newLadder.isActive) {
      return NextResponse.json({ error: "Invalid or inactive ladder" }, { status: 400 });
    }
    
    // Get current user and their partner
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { 
        partner: true,
        ladder: true
      }
    });
    
    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    
    // If already in the same ladder, no action needed
    if (currentUser.ladderId === newLadderId) {
      return NextResponse.json({ success: true, message: "Already in this ladder" });
    }
    
    const usersToMove: typeof currentUser[] = [currentUser];
    if (currentUser.partnerId) {
      // Get the full partner record with same structure as currentUser
      const partnerUser = await prisma.user.findUnique({
        where: { id: currentUser.partnerId },
        include: { 
          partner: true,
          ladder: true
        }
      });
      if (partnerUser) {
        usersToMove.push(partnerUser);
      }
    }
    
    
    // Simple ladder switch - just clear all data and move to new ladder
    await prisma.$transaction(async (tx) => {
      // 1. Update user(s) ladder assignment
      for (const user of usersToMove) {
        await tx.user.update({
          where: { id: user.id },
          data: { ladderId: newLadderId }
        });
      }
      
      // 2. Clear all matches for these users
      // Build team IDs for all users being moved
      const teamIdsToDelete = new Set<string>();
      for (const user of usersToMove) {
        teamIdsToDelete.add(user.id); // Solo team
        if (user.partnerId) {
          // Also add the doubles team ID
          const doubleTeamId = [user.id, user.partnerId].sort().join('-');
          teamIdsToDelete.add(doubleTeamId);
        }
      }
      
      // Delete all matches involving these team IDs
      for (const teamId of Array.from(teamIdsToDelete)) {
        await tx.match.deleteMany({
          where: {
            OR: [
              { team1Id: teamId },
              { team2Id: teamId }
            ]
          }
        });
      }
      
      // 3. Clear all availability for these users
      for (const user of usersToMove) {
        await tx.availability.deleteMany({
          where: {
            userId: user.id
          }
        });
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully switched to ${newLadder.name}. All previous data cleared.`,
      details: {
        movedUsers: usersToMove.length
      }
    });

  } catch (error) {
    return NextResponse.json({ error: "Failed to switch ladder" }, { status: 500 });
  }
}