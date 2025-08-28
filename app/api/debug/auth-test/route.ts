import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    
    console.log("Testing auth for:", email);
    
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log("User not found");
      return NextResponse.json({ error: "User not found", found: false });
    }
    
    console.log("User found:", { id: user.id, email: user.email, name: user.name });
    console.log("Stored hash:", user.password);
    console.log("Testing password:", password);
    
    // Test password
    const ok = await bcrypt.compare(password, user.password);
    console.log("Password match:", ok);
    
    return NextResponse.json({ 
      found: true,
      passwordMatch: ok,
      userDetails: { id: user.id, email: user.email, name: user.name }
    });
    
  } catch (error) {
    console.error("Auth test error:", error);
    return NextResponse.json({ error: "Internal error", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}