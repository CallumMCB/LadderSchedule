import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { name, phone } = await req.json();
    
    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { 
        name: name || null,
        phone: phone || null 
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "Profile updated successfully",
      user: { name: user.name, email: user.email, phone: user.phone }
    });

  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}