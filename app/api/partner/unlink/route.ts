import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
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

    if (!user.partnerId && !user.partneredBy) {
      return NextResponse.json({ error: "No partner to unlink" }, { status: 400 });
    }

    // Unlink both users
    await prisma.$transaction(async (tx) => {
      if (user.partnerId) {
        // This user has a partner
        await tx.user.update({
          where: { id: user.id },
          data: { partnerId: null }
        });
        
        // Update the partner to remove the back-reference
        await tx.user.update({
          where: { id: user.partnerId },
          data: { partnerId: null }
        });
      } else if (user.partneredBy) {
        // This user is partnered by someone else - update both
        await tx.user.update({
          where: { id: user.partneredBy.id },
          data: { partnerId: null }
        });
        
        // Also clear this user's partnerId if it exists
        await tx.user.update({
          where: { id: user.id },
          data: { partnerId: null }
        });
      }
    });

    return NextResponse.json({ success: true, message: "Partner unlinked successfully" });

  } catch (error) {
    console.error("Partner unlink error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}