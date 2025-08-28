import "./globals.css";
import Providers from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";

export const metadata = { title: "Tennis Ladder", description: "Weekly scheduler" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
const session = await getServerSession(authOptions);

return (
<html lang="en">
<body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
<Providers>
<div className="max-w-6xl mx-auto p-4">
<header className="flex items-center justify-between mb-4">
<h1 className="text-xl font-bold">Doubles Tennis Ladder</h1>
<div className="flex gap-4">
{session ? (
<>
<Link href="/" className="text-sm underline">Calendar</Link>
<Link href="/scoring" className="text-sm underline">Scoring</Link>
<Link href="/opponents" className="text-sm underline">Opponents</Link>
<Link href="/help" className="text-sm underline">Help</Link>
<Link href="/profile" className="text-sm underline">Profile</Link>
<a href="/api/auth/signout" className="text-sm underline">Log Out</a>
</>
) : (
<>
<a href="/register" className="text-sm underline">Register</a>
<a href="/login" className="text-sm underline">Login</a>
</>
)}
</div>
</header>
{children}
</div>
</Providers>
</body>
</html>
);
}