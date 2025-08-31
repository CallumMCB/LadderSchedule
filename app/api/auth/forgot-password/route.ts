import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { Resend } from 'resend';

export const runtime = 'nodejs';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendOTPEmail(email: string, name: string, otp: string) {
  console.log(`🔄 Attempting to send email to: ${email}`);
  console.log(`🔑 Resend API key configured: ${!!process.env.RESEND_API_KEY}`);
  
  try {
    if (!resend) {
      throw new Error('Resend API key not configured');
    }
    
    const result = await resend.emails.send({
      from: 'Tennis Ladder <onboarding@resend.dev>', // Use onboarding@resend.dev which is more reliable
      to: [email],
      subject: 'Your Tennis Ladder Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Tennis Ladder Password Reset</h2>
          <p>Hi ${name},</p>
          <p>Your one-time password for resetting your Tennis Ladder account is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <h1 style="color: #2563eb; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>Tennis Ladder Team</p>
        </div>
      `,
      text: `Hi ${name},\n\nYour one-time password for resetting your Tennis Ladder account is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nTennis Ladder Team`
    });
    
    console.log(`✅ Email sent successfully to ${email}. Resend ID:`, result.data?.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    // Fall back to console logging if email fails
    console.log(`
📧 EMAIL TO: ${email} (Email service failed, showing in console)
Subject: Your Tennis Ladder Password Reset Code
OTP: ${otp}
    `);
    throw error; // Re-throw to handle in calling function
  }
}


export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal whether email exists or not for security
      return NextResponse.json({ message: "If the email exists, an OTP will be sent to your email." });
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

    // Send email with OTP
    try {
      await sendOTPEmail(user.email, user.name || 'User', otpCode);
      console.log(`✅ OTP email process completed for ${user.email}: ${otpCode}`);
    } catch (emailError) {
      console.error(`❌ Email sending failed for ${user.email}:`, emailError);
      // Don't fail the request - OTP is still saved in database
      console.log(`📝 OTP still saved to database for manual verification: ${otpCode}`);
    }

    return NextResponse.json({ 
      message: "OTP sent to your email. Enter it on the next page to reset your password.",
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