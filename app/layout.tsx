import "./globals.css";
import Providers from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import MobileNav from "./components/MobileNav";

export const metadata = { title: "Tennis Ladder", description: "Weekly scheduler" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
const session = await getServerSession(authOptions);

return (
<html lang="en">
<body className="min-h-screen text-neutral-900 antialiased" style={{
  backgroundImage: 'url(/tennis-club-background.jpg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: 'fixed'
}}>
<div className="min-h-screen bg-white/85 backdrop-blur-sm">
<Providers>
<div className="max-w-6xl mx-auto p-4">
<header className="flex items-center justify-between mb-4">
<h1 className="text-xl font-bold">Doubles Tennis Ladder</h1>

{/* Desktop Navigation */}
{session && (
<div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 gap-6">
<Link href="/" className="text-sm underline hover:text-blue-600 font-medium">Calendar</Link>
<Link href="/opponents" className="text-sm underline hover:text-blue-600 font-medium">Opponents</Link>
<Link href="/scoring" className="text-sm underline hover:text-blue-600 font-medium">Scoring</Link>
<Link href="/ladder" className="text-sm underline hover:text-blue-600 font-medium">Whole Ladder</Link>
</div>
)}

{/* Mobile Navigation */}
{session && <MobileNav />}

<div className="hidden md:flex gap-4">
{session ? (
<>
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
</div>
</body>
</html>
);
}