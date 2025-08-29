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
    const { weekStartISO, availableSlots, unavailableSlots, noneSlots, targetUserId } = await req.json();
    
    if (!weekStartISO || !targetUserId) {
      return NextResponse.json({ error: "weekStartISO and targetUserId required" }, { status: 400 });
    }

    const weekStart = mondayStart(weekStartISO);
    const availableSlotDates = (availableSlots || []).map((s: string) => new Date(s));
    const unavailableSlotDates = (unavailableSlots || []).map((s: string) => new Date(s));
    const noneSlotDates = (noneSlots || []).map((s: string) => new Date(s));

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

    await prisma.$transaction(async (tx) => {
      // Handle available slot takeovers
      for (const slotDate of availableSlotDates) {
        // Update existing slot to change ownership, or create if doesn't exist
        await tx.availability.upsert({
          where: {
            userId_startAt: {
              userId: targetUserId,
              startAt: slotDate
            }
          },
          update: {
            availability: "available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id // Only set if different user
          },
          create: {
            userId: targetUserId,
            startAt: slotDate,
            weekStart: weekStart,
            availability: "available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id
          }
        });
      }

      // Handle unavailable slot takeovers
      for (const slotDate of unavailableSlotDates) {
        await tx.availability.upsert({
          where: {
            userId_startAt: {
              userId: targetUserId,
              startAt: slotDate
            }
          },
          update: {
            availability: "not_available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id
          },
          create: {
            userId: targetUserId,
            startAt: slotDate,
            weekStart: weekStart,
            availability: "not_available",
            setByUserId: targetUserId === currentUser.id ? null : currentUser.id
          }
        });
      }

      // Handle none slot takeovers by deleting the availability entries
      if (noneSlotDates.length > 0) {
        await tx.availability.deleteMany({
          where: {
            userId: targetUserId,
            startAt: { in: noneSlotDates },
            weekStart: weekStart
          }
        });
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: `Updated ${availableSlotDates.length + unavailableSlotDates.length + noneSlotDates.length} slots for ${targetUser.name || targetUser.email}`,
      availableSlotsCount: availableSlotDates.length,
      unavailableSlotsCount: unavailableSlotDates.length,
      noneSlotsCount: noneSlotDates.length
    });

  } catch (error) {
    console.error("Takeover availability error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}