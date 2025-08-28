import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
prisma.availability.findMany({ where: { userId: me.id, weekStart }, select: { startAt: true } }),
me.partnerId ? prisma.user.findUnique({ where: { id: me.partnerId } }) : Promise.resolve(null),
]);

let partnerSlots: Date[] = [];
if (partner) {
const rows = await prisma.availability.findMany({ where: { userId: partner.id, weekStart }, select: { startAt: true } });
partnerSlots = rows.map(r => r.startAt);
}

return NextResponse.json({
mySlots: mySlots.map(r => r.startAt.toISOString()),
partnerSlots: partnerSlots.map(d => d.toISOString()),
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
// Delete all availability I set for myself this week
await tx.availability.deleteMany({ 
where: { 
userId: me.id, 
weekStart,
setByUserId: me.id // Only delete my own settings, not proxy settings
} 
});
if (slots.length) {
await tx.availability.createMany({
data: slots.map((startAt) => ({ userId: me.id, startAt, weekStart, setByUserId: me.id })),
});
}
});

return NextResponse.json({ ok: true });
}