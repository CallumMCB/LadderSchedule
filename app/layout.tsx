import "./globals.css";
import Providers from "./providers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import MobileNav from "./components/MobileNav";
import { Analytics } from "@vercel/analytics/next";
import HeaderNav from "./components/HeaderNav";

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
<HeaderNav session={session} />
{children}
</div>
</Providers>
</div>
<Analytics />
</body>
</html>
);
}