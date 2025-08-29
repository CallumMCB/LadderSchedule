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

      // Delete only the specific proxy-set slots we're updating, preserve user's own slots and other proxy slots
      const allSlotDates = [...availableSlotDates, ...unavailableSlotDates];
      if (allSlotDates.length > 0) {
        await tx.availability.deleteMany({ 
          where: { 
            userId: targetUserId, 
            weekStart,
            startAt: { in: allSlotDates },
            setByUserId: { not: targetUserId } // Only delete non-user-set slots for these specific times
          } 
        });
      }

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
            availability: "available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id // Only set if different user
          })),
        });
      }

      // Handle unavailable slots: create entries with availability="not_available"
      const newUnavailableSlots = unavailableSlotDates.filter((date: Date) => 
        !userOwnSlots.includes(date.toISOString())
      );

      if (newUnavailableSlots.length) {
        // First delete existing proxy-set slots for these times
        await tx.availability.deleteMany({
          where: {
            userId: targetUserId,
            startAt: { in: newUnavailableSlots },
            setByUserId: { not: targetUserId } // Only delete proxy-set slots
          }
        });
        
        // Then create new unavailable entries
        await tx.availability.createMany({
          data: newUnavailableSlots.map((startAt: Date) => ({ 
            userId: targetUserId, 
            startAt, 
            weekStart,
            availability: "not_available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id // Only set if different user
          })),
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