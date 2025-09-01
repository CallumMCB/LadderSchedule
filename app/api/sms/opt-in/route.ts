import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const matchId = searchParams.get("matchId");

  if (!userId || !matchId) {
    return NextResponse.json({ error: "Missing userId or matchId" }, { status: 400 });
  }

  try {
    // Verify the user and match exist
    const [user, match] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true }
      }),
      prisma.match.findUnique({
        where: { id: matchId },
        select: { id: true, startAt: true, team1Id: true, team2Id: true }
      })
    ]);

    if (!user || !match) {
      return NextResponse.json({ error: "Invalid user or match" }, { status: 404 });
    }

    // Check if user is part of this match
    const isUserInMatch = match.team1Id.includes(userId) || match.team2Id.includes(userId);
    if (!isUserInMatch) {
      return NextResponse.json({ error: "User not part of this match" }, { status: 403 });
    }

    // If user already has a phone number, redirect to success page
    if (user.phone) {
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>SMS Reminders Already Enabled</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; text-align: center; }
            .success { color: #059669; }
            .card { background: #f9fafb; padding: 30px; border-radius: 12px; border: 1px solid #e5e7eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="success">✅ SMS Reminders Already Enabled</h1>
            <p>You already have SMS reminders enabled for your account.</p>
            <p>You'll receive a reminder 1 hour before your match.</p>
            <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin-top: 20px;">
              Back to Tennis Ladder
            </a>
          </div>
        </body>
        </html>
      `;
      return new NextResponse(successHtml, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Show phone number input form
    const formHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Enable SMS Match Reminders</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px; 
            background-color: #f9fafb;
          }
          .card { 
            background: white; 
            padding: 30px; 
            border-radius: 12px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .header { color: #059669; text-align: center; margin-bottom: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; font-weight: 600; color: #374151; }
          input[type="tel"] { 
            width: 100%; 
            padding: 12px; 
            border: 1px solid #d1d5db; 
            border-radius: 6px; 
            box-sizing: border-box;
            font-size: 16px;
          }
          .submit-btn { 
            background: #059669; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 8px; 
            font-weight: 600; 
            cursor: pointer; 
            width: 100%;
            font-size: 16px;
          }
          .submit-btn:hover { background: #047857; }
          .info { background: #eff6ff; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0ea5e9; }
          .skip-link { text-align: center; margin-top: 15px; }
          .skip-link a { color: #6b7280; text-decoration: none; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="header">📱 Enable SMS Match Reminders</h1>
          
          <div class="info">
            <p style="margin: 0; color: #1e40af;">
              <strong>Hi ${user.name || user.email}!</strong><br>
              Get reminded 1 hour before your tennis matches via SMS.
            </p>
          </div>

          <form action="/api/sms/opt-in" method="POST">
            <input type="hidden" name="userId" value="${userId}">
            <input type="hidden" name="matchId" value="${matchId}">
            
            <div class="form-group">
              <label for="phone">Phone Number</label>
              <input 
                type="tel" 
                id="phone" 
                name="phone" 
                placeholder="+44 7123 456789" 
                required
                pattern="^\\+?[1-9]\\d{1,14}$"
                title="Please enter a valid phone number with country code"
              >
            </div>
            
            <button type="submit" class="submit-btn">Enable SMS Reminders</button>
          </form>
          
          <div class="skip-link">
            <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}">Skip for now</a>
          </div>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(formHtml, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error("SMS opt-in GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userId = formData.get("userId") as string;
    const matchId = formData.get("matchId") as string;
    const phone = formData.get("phone") as string;

    if (!userId || !matchId || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    // Update user's phone number
    await prisma.user.update({
      where: { id: userId },
      data: { phone: phone.replace(/\s/g, '') } // Remove spaces
    });

    // Show success page
    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>SMS Reminders Enabled</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; text-align: center; }
          .success { color: #059669; }
          .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="success">✅ SMS Reminders Enabled!</h1>
          <p>Great! You'll now receive SMS reminders 1 hour before your tennis matches.</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; margin-top: 20px;">
            Back to Tennis Ladder
          </a>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(successHtml, {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error("SMS opt-in POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}