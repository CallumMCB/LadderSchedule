import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { email, otpCode, newPassword } = await request.json();

    if (!email || !otpCode || !newPassword) {
      return NextResponse.json({ error: "Email, OTP code, and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Find user with valid OTP
    const user = await prisma.user.findFirst({
      where: {
        email: email,
        otpCode: otpCode,
        otpExpiry: {
          gt: new Date(), // OTP not expired
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired OTP code" }, { status: 400 });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear OTP
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otpCode: null,
        otpExpiry: null,
      },
    });

    console.log(`✅ Password reset successful for user: ${email}`);
    return NextResponse.json({ message: "Password reset successful" });

  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}