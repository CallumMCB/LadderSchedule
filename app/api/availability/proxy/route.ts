import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

function mondayStart(dateISO: string) {
  const d = new Date(dateISO);
  const day = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { weekStartISO, availableSlots, unavailableSlots, slots, targetUserId } = await req.json();
    
    // Support both old format (slots) and new format (availableSlots/unavailableSlots)
    const available = availableSlots || slots || [];
    const unavailable = unavailableSlots || [];
    
    if (!weekStartISO || !targetUserId) {
      return NextResponse.json({ error: "weekStartISO and targetUserId required" }, { status: 400 });
    }

    const weekStart = mondayStart(weekStartISO);
    const availableSlotDates = available.map((s: string) => new Date(s));
    const unavailableSlotDates = unavailable.map((s: string) => new Date(s));

    // Get current user
    const currentUser = await prisma.user.findUnique({ 
      where: { email: session.user.email }
    });
    if (!currentUser) {
      return NextResponse.json({ error: "Current user not found" }, { status: 404 });
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    // Smart update: preserve slots set by the user themselves, only override proxy-set slots
    await prisma.$transaction(async (tx) => {
      // Get existing availability for this user and week
      const existingSlots = await tx.availability.findMany({ 
        where: { userId: targetUserId, weekStart },
        select: { startAt: true, setByUserId: true }
      });

      // Identify which slots were set by the user themselves vs by others (proxy)
      const userOwnSlots = existingSlots
        .filter(slot => slot.setByUserId === targetUserId)
        .map(slot => slot.startAt.toISOString());

      // Delete only proxy-set slots, preserve user's own slots
      await tx.availability.deleteMany({ 
        where: { 
          userId: targetUserId, 
          weekStart,
          setByUserId: { not: targetUserId } // Only delete non-user-set slots
        } 
      });

      // Add new available slots (excluding any that the user has set themselves)
      const newAvailableSlots = availableSlotDates.filter((date: Date) => 
        !userOwnSlots.includes(date.toISOString())
      );

      if (newAvailableSlots.length) {
        await tx.availability.createMany({
          data: newAvailableSlots.map((startAt: Date) => ({ 
            userId: targetUserId, 
            startAt, 
            weekStart,
            setByUserId: currentUser.id // Track who set this
          })),
        });
      }

      // Handle unavailable slots: delete any proxy-set availability for these slots
      // (but preserve user's own slots even if they're marked unavailable by proxy)
      const unavailableSlotsToDelete = unavailableSlotDates.filter((date: Date) => 
        !userOwnSlots.includes(date.toISOString())
      );

      if (unavailableSlotsToDelete.length) {
        await tx.availability.deleteMany({
          where: {
            userId: targetUserId,
            startAt: { in: unavailableSlotsToDelete },
            setByUserId: { not: targetUserId } // Only delete proxy-set slots
          }
        });
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Availability updated for ${targetUser.name || targetUser.email}`,
      availableSlotsCount: available.length,
      unavailableSlotsCount: unavailable.length
    });

  } catch (error) {
    console.error("Proxy availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}