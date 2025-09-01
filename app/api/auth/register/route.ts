import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, name, phone, password, notificationPreferences } = await req.json();
    
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 400 });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        phone: phone || null,
        password: hashedPassword,
        notificationPreference: "email",
        receiveUpdates: notificationPreferences?.receiveUpdates ?? true,
        receiveMatchNotifications: notificationPreferences?.receiveMatchNotifications ?? true,
        receiveMarketing: notificationPreferences?.receiveMarketing ?? false,
      },
    });
    
    return NextResponse.json({ 
      message: "User created successfully",
      userId: user.id 
    });
    
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}