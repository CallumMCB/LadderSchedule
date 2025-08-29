import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

function mondayStart(dateISO: string) {
const d = new Date(dateISO);
const day = (d.getUTCDay() + 6) % 7; // 0=Mon
d.setUTCDate(d.getUTCDate() - day);
d.setUTCHours(0, 0, 0, 0);
return d;
}

export async function GET(req: NextRequest) {
const session = await getServerSession(authOptions);
if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const { searchParams } = new URL(req.url);
const weekStartISO = searchParams.get("weekStart");
if (!weekStartISO) return NextResponse.json({ error: "weekStart required" }, { status: 400 });

const weekStart = mondayStart(weekStartISO);
const me = await prisma.user.findUnique({ where: { email: session.user.email } });
if (!me) return NextResponse.json({ error: "user not found" }, { status: 404 });

const [mySlots, partner] = await Promise.all([
prisma.availability.findMany({ where: { userId: me.id, weekStart }, select: { startAt: true, availability: true, setByUserId: true } }),
me.partnerId ? prisma.user.findUnique({ where: { id: me.partnerId } }) : Promise.resolve(null),
]);

let partnerSlots: Array<{ startAt: Date; availability: string; setByUserId: string | null }> = [];
if (partner) {
const rows = await prisma.availability.findMany({ where: { userId: partner.id, weekStart }, select: { startAt: true, availability: true, setByUserId: true } });
partnerSlots = rows;
}

return NextResponse.json({
mySlots: mySlots.filter(r => r.availability === "available").map(r => r.startAt.toISOString()),
partnerSlots: partnerSlots.filter(d => d.availability === "available").map(d => d.startAt.toISOString()),
myUnavailableSlots: mySlots.filter(r => r.availability === "not_available").map(r => r.startAt.toISOString()),
partnerUnavailableSlots: partnerSlots.filter(d => d.availability === "not_available").map(d => d.startAt.toISOString()),
mySlotsSetBy: mySlots.map(r => r.setByUserId),
partnerSlotsSetBy: partnerSlots.map(d => d.setByUserId),
myAvailabilityStates: mySlots.map(r => r.availability),
partnerAvailabilityStates: partnerSlots.map(d => d.availability),
partnerEmail: partner?.email ?? null,
});
}

export async function POST(req: NextRequest) {
const session = await getServerSession(authOptions);
if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const body = await req.json().catch(() => null) as { weekStartISO?: string; slots?: string[] } | null;
if (!body?.weekStartISO || !Array.isArray(body.slots)) return NextResponse.json({ error: "bad request" }, { status: 400 });

const weekStart = mondayStart(body.weekStartISO);
const slots = body.slots.map(s => new Date(s));

const me = await prisma.user.findUnique({ where: { email: session.user.email } });
if (!me) return NextResponse.json({ error: "user not found" }, { status: 404 });

// Replace my availability for this week atomically
await prisma.$transaction(async (tx) => {
// Delete all availability I set for myself this week (where setByUserId is null or me.id)
await tx.availability.deleteMany({ 
where: { 
userId: me.id, 
weekStart,
OR: [
  { setByUserId: null }, // My own slots
  { setByUserId: me.id }  // Legacy format where I set my own
]
} 
});
if (slots.length) {
await tx.availability.createMany({
data: slots.map((startAt) => ({ userId: me.id, startAt, weekStart, availability: "available", setByUserId: null })), // Don't set setByUserId for own slots
});
}
});

return NextResponse.json({ ok: true });
}