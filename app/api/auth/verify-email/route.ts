import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signIn } from "next-auth/react";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Verification token is required" }, { status: 400 });
  }

  try {
    // Find user with this verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerified: false,
        emailVerificationExpiry: {
          gt: new Date() // Token hasn't expired
        }
      }
    });

    if (!user) {
      // Token invalid or expired - show error page
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Email Verification Failed</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 500px; 
              margin: 50px auto; 
              padding: 20px; 
              text-align: center; 
              background-color: #f9fafb;
            }
            .error { color: #dc2626; }
            .card { 
              background: white; 
              padding: 30px; 
              border-radius: 12px; 
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="error">❌ Verification Failed</h1>
            <p>This verification link is invalid or has expired.</p>
            <p>Please try registering again or contact support if you continue to have issues.</p>
            <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/register" 
               style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin-top: 20px;">
              Try Registering Again
            </a>
          </div>
        </body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Verify the user's email
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null
      }
    });

    // Show success page that will auto-redirect to login with credentials
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified Successfully</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px; 
            text-align: center; 
            background-color: #f9fafb;
          }
          .success { color: #059669; }
          .card { 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .spinner {
            border: 2px solid #f3f3f3;
            border-top: 2px solid #059669;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-right: 10px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="success">✅ Email Verified Successfully!</h1>
          <p>Welcome to Tennis Ladder! Your account is now active.</p>
          <p><div class="spinner"></div>Redirecting you to login...</p>
          
          <script>
            // Auto-redirect to login page with verification success message
            setTimeout(function() {
              window.location.href = '${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/login?verified=true&email=${encodeURIComponent(user.email)}';
            }, 2000);
          </script>
          
          <p style="margin-top: 30px; font-size: 14px; color: #6b7280;">
            If you're not redirected automatically, 
            <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/login" style="color: #059669;">click here to login</a>
          </p>
        </div>
      </body>
      </html>
    `;

    console.log(`✅ Email verified successfully for user: ${user.email}`);
    
    return new NextResponse(successHtml, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}