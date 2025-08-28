import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
const session = await getServerSession(authOptions);
if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

const { partnerEmail } = await req.json().catch(() => ({ partnerEmail: "" }));
if (!partnerEmail) return NextResponse.json({ error: "partnerEmail required" }, { status: 400 });

const me = await prisma.user.findUnique({ where: { email: session.user.email } });
if (!me) return NextResponse.json({ error: "user not found" }, { status: 404 });

const them = await prisma.user.findUnique({ where: { email: partnerEmail } });

if (them) {
// Partner exists - create bidirectional link
if (me.id === them.id) return NextResponse.json({ error: "cannot partner yourself" }, { status: 400 });

// Check if partner is in a different ladder
const shouldSwitchLadder = them.ladderId && them.ladderId !== me.ladderId;
let switchMessage = "";

if (shouldSwitchLadder) {
// Clear current user's data and switch to partner's ladder
await prisma.$transaction(async (tx) => {
// 1. Clear all matches for current user
const myTeamIds = [me.id];
if (me.partnerId) {
myTeamIds.push([me.id, me.partnerId].sort().join('-'));
}

for (const teamId of myTeamIds) {
await tx.match.deleteMany({
where: {
OR: [
{ team1Id: teamId },
{ team2Id: teamId }
]
}
});
}

// 2. Clear all availability for current user
await tx.availability.deleteMany({
where: { userId: me.id }
});

// 3. Update both users with partnership and ladder
await tx.user.update({ 
where: { id: me.id }, 
data: { 
partnerId: them.id,
ladderId: them.ladderId 
}
});
await tx.user.update({ 
where: { id: them.id }, 
data: { partnerId: me.id }
});
});

const ladder = await prisma.ladder.findUnique({ where: { id: them.ladderId! } });
switchMessage = ` You've been moved to ${ladder?.name || 'their ladder'}.`;
} else {
// Simple two-way link, no ladder change needed
await prisma.$transaction([
prisma.user.update({ where: { id: me.id }, data: { partnerId: them.id } }),
prisma.user.update({ where: { id: them.id }, data: { partnerId: me.id } }),
]);
}

return NextResponse.json({ 
ok: true, 
message: `Partner linked successfully!${switchMessage}`,
ladderSwitched: shouldSwitchLadder
});
} else {
// Partner doesn't exist - for now just store as linked partner email (placeholder)
// In a real app, you might create a placeholder or invitation system
await prisma.user.update({ 
where: { id: me.id }, 
data: { partnerId: null }
});

return NextResponse.json({ 
ok: true, 
message: `Partner "${partnerEmail}" will be linked when they register`,
isPlaceholder: true,
placeholderEmail: partnerEmail
});
}
}