import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    console.log("Create ladder: No session found", { session });
    return NextResponse.json({ error: "unauthorized - please log in" }, { status: 401 });
  }

  try {
    const { name, endDate } = await req.json();
    
    if (!name || !endDate) {
      return NextResponse.json({ error: "name and endDate required" }, { status: 400 });
    }

    // Get current user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    // Find the next available ladder number
    const existingLadders = await prisma.ladder.findMany({
      select: { number: true },
      orderBy: { number: 'asc' }
    });

    let nextNumber = 1;
    for (const ladder of existingLadders) {
      if (ladder.number === nextNumber) {
        nextNumber++;
      } else {
        break;
      }
    }

    // Create new ladder
    const newLadder = await prisma.ladder.create({
      data: {
        name: name.trim(),
        number: nextNumber,
        endDate: new Date(endDate),
        isActive: true
      }
    });

    // Assign user to new ladder (this will clear their data automatically via the switch logic)
    await prisma.user.update({
      where: { id: user.id },
      data: { ladderId: newLadder.id }
    });

    // If user has partner, move them too
    if (user.partnerId) {
      await prisma.user.update({
        where: { id: user.partnerId },
        data: { ladderId: newLadder.id }
      });
    }

    return NextResponse.json({ 
      success: true, 
      ladder: {
        id: newLadder.id,
        name: newLadder.name,
        number: newLadder.number,
        endDate: newLadder.endDate.toISOString()
      },
      message: `Successfully created "${name}" and joined it!`
    });

  } catch (error) {
    console.error("Error creating ladder:", error);
    return NextResponse.json({ 
      error: "Failed to create ladder", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}