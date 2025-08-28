import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { partner: true, partneredBy: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user and all related data
    await prisma.$transaction(async (tx) => {
      // First, unlink partner if exists
      if (user.partnerId) {
        await tx.user.update({
          where: { id: user.partnerId },
          data: { partnerId: null }
        });
      }
      if (user.partneredBy) {
        await tx.user.update({
          where: { id: user.partneredBy.id },
          data: { partnerId: null }
        });
      }

      // Delete user's availability records
      await tx.availability.deleteMany({
        where: { userId: user.id }
      });

      // Delete availability records set by this user for others
      await tx.availability.deleteMany({
        where: { setByUserId: user.id }
      });

      // Delete matches involving this user's teams
      const userTeamIds: string[] = [
        user.id, // Solo team
        user.partnerId ? [user.id, user.partnerId].sort().join('-') : null // Partner team
      ].filter(Boolean) as string[];

      await tx.match.deleteMany({
        where: {
          OR: [
            { team1Id: { in: userTeamIds } },
            { team2Id: { in: userTeamIds } }
          ]
        }
      });

      // Finally, delete the user
      await tx.user.delete({
        where: { id: user.id }
      });
    });

    return NextResponse.json({ success: true, message: "Account deleted successfully" });

  } catch (error) {
    console.error("Account deletion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}