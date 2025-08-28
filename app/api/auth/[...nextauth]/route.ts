import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

export const authOptions: NextAuthOptions = {
session: { strategy: "jwt" },
providers: [
CredentialsProvider({
name: "Credentials",
credentials: {
email: { label: "Email", type: "text" },
password: { label: "Password", type: "password" },
},
async authorize(credentials) {
if (!credentials?.email || !credentials?.password) return null;
const user = await prisma.user.findUnique({ where: { email: credentials.email } });
if (!user) return null;
const ok = await bcrypt.compare(credentials.password, user.password);
if (!ok) return null;
return { id: user.id, name: user.name ?? user.email, email: user.email } as any;
},
}),
],
callbacks: {
async jwt({ token, user }) {
if (user) token.id = (user as any).id;
return token;
},
async session({ session, token }) {
if (token?.id && session.user) (session.user as any).id = token.id as string;
return session;
},
},
pages: { signIn: "/login" },
secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };