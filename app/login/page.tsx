"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [showForgotPassword, setShowForgotPassword] = useState(false);
const [forgotEmail, setForgotEmail] = useState("");
const [message, setMessage] = useState("");
const [resetMethod, setResetMethod] = useState<'email' | 'sms'>('email');

async function onSubmit(e: React.FormEvent) {
e.preventDefault();
setError("");
const res = await signIn("credentials", { email, password, redirect: false });
if (res?.error) {
setError(res.error);
} else if (res?.ok) {
window.location.href = "/";
} else {
setError("Login failed - please try again");
}
}

async function handleForgotPassword(e: React.FormEvent) {
e.preventDefault();
setError("");
setMessage("");

if (!forgotEmail) {
setError("Please enter your email address");
return;
}

try {
const response = await fetch('/api/auth/forgot-password', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ email: forgotEmail, method: resetMethod }),
});

if (response.ok) {
setMessage(`One-time password sent to your ${resetMethod}!`);
setTimeout(() => {
setShowForgotPassword(false);
setMessage("");
setForgotEmail("");
}, 3000);
} else {
const error = await response.json();
setError(error.error || "Failed to send reset email");
}
} catch (error) {
setError("Network error");
}
}

return (
<div className="max-w-md mx-auto mt-10 p-6 rounded-2xl border bg-white shadow-sm">
<h2 className="text-xl font-semibold mb-4">{showForgotPassword ? "Reset Password" : "Log in"}</h2>

{!showForgotPassword ? (
<>
<form onSubmit={onSubmit} className="space-y-3">
<label className="block text-sm">Email</label>
<Input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
<label className="block text-sm mt-2">Password</label>
<Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
{error && <div className="text-sm text-red-600">{error}</div>}
{message && <div className="text-sm text-green-600">{message}</div>}
<div className="pt-2"><Button type="submit" className="w-full">Sign in</Button></div>
</form>

<div className="mt-4 text-center space-y-2">
<button 
onClick={() => setShowForgotPassword(true)}
className="text-sm text-blue-600 hover:underline"
>
Forgot your password?
</button>
<div>
<span className="text-sm text-gray-600">Don't have an account? </span>
<a href="/register" className="text-sm text-blue-600 hover:underline">
Register here
</a>
</div>
</div>
</>
) : (
<>
<form onSubmit={handleForgotPassword} className="space-y-3">
<p className="text-sm text-gray-600 mb-4">
Choose how you'd like to receive your one-time password.
</p>

<div className="space-y-2">
<label className="block text-sm font-medium">Reset Method</label>
<div className="flex gap-4">
<label className="flex items-center">
<input 
type="radio" 
name="resetMethod" 
value="email" 
checked={resetMethod === 'email'}
onChange={(e) => setResetMethod(e.target.value as 'email' | 'sms')}
className="mr-2"
/>
Email
</label>
<label className="flex items-center">
<input 
type="radio" 
name="resetMethod" 
value="sms" 
checked={resetMethod === 'sms'}
onChange={(e) => setResetMethod(e.target.value as 'email' | 'sms')}
className="mr-2"
/>
SMS
</label>
</div>
</div>

<label className="block text-sm">Email</label>
<Input 
value={forgotEmail} 
onChange={e => setForgotEmail(e.target.value)} 
placeholder="you@example.com"
type="email"
/>
{error && <div className="text-sm text-red-600">{error}</div>}
{message && <div className="text-sm text-green-600">{message}</div>}
<div className="pt-2 flex gap-2">
<Button type="submit" className="flex-1">Send OTP</Button>
<Button 
type="button" 
variant="outline" 
onClick={() => {
setShowForgotPassword(false);
setError("");
setMessage("");
setForgotEmail("");
}}
>
Cancel
</Button>
</div>
</form>
</>
)}
</div>
);
}