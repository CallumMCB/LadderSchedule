import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { Resend } from 'resend';

export const runtime = 'nodejs';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendOTPEmail(email: string, name: string, otp: string) {
  console.log(`🔄 Attempting to send email to: ${email}`);
  console.log(`🔑 Resend API key configured: ${!!process.env.RESEND_API_KEY}`);
  console.log(`🔑 API key starts with: ${process.env.RESEND_API_KEY?.substring(0, 8)}...`);
  
  try {
    if (!resend) {
      throw new Error('Resend API key not configured');
    }
    
    const result = await resend.emails.send({
      from: 'Tennis Ladder <noreply@ladderschedule.com>',
      to: [email],
      subject: 'Your Tennis Ladder Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
          <div style="background: linear-gradient(135deg, #065f46 0%, #059669 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px; font-weight: bold;">🔐 Tennis Ladder Password Reset</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">Your one-time password to reset your account</p>
          </div>
          
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <h2 style="color: #059669; margin: 0 0 16px 0; font-size: 18px;">Hi ${name}!</h2>
            
            <p style="margin: 16px 0; color: #374151; line-height: 1.6;">
              You requested a password reset for your Tennis Ladder account. 
              Use the one-time password below to reset your password:
            </p>

            <div style="background: #f0f9ff; padding: 24px; text-align: center; border-radius: 12px; margin: 24px 0; border: 2px solid #0ea5e9;">
              <h1 style="color: #0369a1; font-size: 36px; margin: 0; letter-spacing: 6px; font-weight: bold;">${otp}</h1>
              <p style="margin: 8px 0 0 0; color: #0369a1; font-size: 14px;">Enter this code on the reset password page</p>
            </div>

            <div style="background: #fef7cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Important:</strong> This code will expire in 10 minutes for your security. 
                If you didn't request this reset, please ignore this email.
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password" 
                 style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            
            <p style="margin: 0; color: #6b7280; font-size: 14px; text-align: center;">
              Need help? We're here for you! 🎾<br>
              <span style="color: #9ca3af;">Tennis Ladder Team</span>
            </p>
          </div>
        </div>
      `,
      text: `🔐 Tennis Ladder Password Reset

Hi ${name}!

You requested a password reset for your Tennis Ladder account. Use the one-time password below to reset your password:

OTP: ${otp}

Important: This code will expire in 10 minutes for your security. If you didn't request this reset, please ignore this email.

Reset your password: ${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password

Need help? We're here for you! 🎾

Tennis Ladder Team`
    });
    
    console.log(`✅ Email sent successfully to ${email}`);
    console.log('📧 Resend response:', JSON.stringify(result, null, 2));
    
    if (result.error) {
      throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
    }
    
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
      // Don't reveal whether email exists or not for security - but don't actually send email
      console.log(`❌ Password reset attempted for non-existent email: ${email}`);
      return NextResponse.json({ message: "If the email exists, an OTP will be sent to your email." });
    }

    // Rate limiting: Check if user requested OTP recently (within 1 minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000); // 1 minute ago
    if (user.otpExpiry && user.otpExpiry > oneMinuteAgo) {
      const timeLeft = Math.ceil((user.otpExpiry.getTime() - oneMinuteAgo.getTime()) / 1000);
      console.log(`⏱️ Rate limit hit for ${email}. ${timeLeft}s remaining.`);
      return NextResponse.json({ 
        error: `Please wait ${timeLeft} seconds before requesting another code.` 
      }, { status: 429 });
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
      console.log(`✅ OTP email sent successfully for registered user: ${user.email}`);
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