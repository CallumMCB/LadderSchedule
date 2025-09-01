"use client";
import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
const searchParams = useSearchParams();
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [error, setError] = useState("");
const [showForgotPassword, setShowForgotPassword] = useState(false);
const [forgotEmail, setForgotEmail] = useState("");
const [message, setMessage] = useState("");

useEffect(() => {
  // Check for verification success and pre-fill email
  const verified = searchParams.get('verified');
  const emailParam = searchParams.get('email');
  
  if (verified === 'true') {
    setMessage("🎉 Email verified successfully! You can now log in.");
  }
  
  if (emailParam) {
    setEmail(decodeURIComponent(emailParam));
  }
}, [searchParams]);

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
body: JSON.stringify({ email: forgotEmail }),
});

if (response.ok) {
const data = await response.json();
let displayMessage = `One-time password sent to your email!`;
// In development, show the OTP for testing
if (data.otp) {
displayMessage += ` (Dev mode OTP: ${data.otp})`;
}
setMessage(displayMessage + " Redirecting to reset password page...");
setTimeout(() => {
window.location.href = `/reset-password?email=${encodeURIComponent(forgotEmail)}`;
}, 2000);
} else {
const error = await response.json();
if (response.status === 429) {
setError(error.error || "Rate limit exceeded. Please wait before trying again.");
} else {
setError(error.error || "Failed to send reset email");
}
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
Enter your email address and we'll send you a one-time password to reset your password.
</p>

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