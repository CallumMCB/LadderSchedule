import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { partner: { select: { email: true, name: true } } }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      partnerEmail: user.partner?.email || null,
      partnerName: user.partner?.name || null
    });

  } catch (error) {
    console.error("Partner info error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}