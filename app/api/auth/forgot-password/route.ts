import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = 'nodejs';

async function sendOTPEmail(email: string, name: string, otp: string) {
  // In a real application, you would use a service like SendGrid, Mailgun, etc.
  // For now, we'll simulate sending an email
  console.log(`
📧 EMAIL TO: ${email}
Subject: Your Tennis Ladder Password Reset Code

Hi ${name},

Your one-time password for resetting your Tennis Ladder account is:

${otp}

This code will expire in 10 minutes.

If you didn't request this, please ignore this email.

Best regards,
Tennis Ladder Team
  `);
  
  // TODO: Replace with actual email service
  // Example with nodemailer or SendGrid would go here
}

async function sendOTPSMS(phone: string, otp: string) {
  // In a real application, you would use a service like Twilio, AWS SNS, etc.
  // For now, we'll simulate sending an SMS
  console.log(`
📱 SMS TO: ${phone}
Your Tennis Ladder password reset code is: ${otp}
Expires in 10 minutes.
  `);
  
  // TODO: Replace with actual SMS service
  // Example with Twilio would go here
}

export async function POST(request: Request) {
  try {
    const { email, method = 'email' } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal whether email exists or not for security
      return NextResponse.json({ message: `If the email exists, an OTP will be sent to your ${method}.` });
    }

    // Check if SMS is requested but user has no phone number
    if (method === 'sms' && !user.phone) {
      return NextResponse.json({ error: "No phone number on file. Please use email reset or contact support." }, { status: 400 });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    await prisma.user.update({
      where: { email },
      data: {
        otpCode,
        otpExpiry,
      },
    });

    if (method === 'email') {
      // Send email with OTP
      await sendOTPEmail(user.email, user.name || 'User', otpCode);
      console.log(`OTP sent to email ${user.email}: ${otpCode}`);
    } else if (method === 'sms') {
      // Send SMS with OTP  
      await sendOTPSMS(user.phone!, otpCode);
      console.log(`OTP sent to SMS ${user.phone}: ${otpCode}`);
    }

    return NextResponse.json({ 
      message: `OTP sent to your ${method}. Enter it on the next page to reset your password.`,
      // In development, include the OTP for testing
      ...(process.env.NODE_ENV === 'development' && { 
        otp: otpCode
      })
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}