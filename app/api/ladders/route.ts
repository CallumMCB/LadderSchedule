import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // Get current user with ladder info
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { ladder: true }
    });

    // Get all active ladders
    const allLadders = await prisma.ladder.findMany({
      where: { isActive: true },
      orderBy: { number: 'asc' }
    });

    return NextResponse.json({
      currentLadder: currentUser?.ladder,
      allLadders
    });

  } catch (error) {
    console.error("Error fetching ladders:", error);
    return NextResponse.json({ error: "Failed to fetch ladders" }, { status: 500 });
  }
}