import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEmailVerification } from "@/lib/email";

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
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user (but unverified)
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
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Send verification email
    try {
      await sendEmailVerification(email, name || 'User', verificationToken);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      // Delete the user if email failed
      await prisma.user.delete({ where: { id: user.id } });
      return NextResponse.json({ 
        error: "Failed to send verification email. Please try again." 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      message: "Account created! Please check your email and click the verification link to complete registration.",
      emailSent: true
    });
    
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}