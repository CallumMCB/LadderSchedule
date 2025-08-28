import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const users = await prisma.user.findMany({
      select: { 
        email: true, 
        name: true,
        partnerId: true
      },
      where: {
        AND: [
          {
            email: {
              not: session.user.email // Don't include current user
            }
          },
          {
            partnerId: null // Only include users without partners
          }
        ]
      },
      orderBy: { email: 'asc' }
    });

    // Remove partnerId from response since we don't want to expose it
    const availableUsers = users.map(user => ({
      email: user.email,
      name: user.name
    }));

    return NextResponse.json({ users: availableUsers });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}