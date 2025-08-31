"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email) {
      setError("Email is required");
      return;
    }

    if (!otpCode) {
      setError("OTP code is required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otpCode, newPassword }),
      });

      if (response.ok) {
        setMessage("Password reset successful! Redirecting to login...");
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        const error = await response.json();
        setError(error.error || "Failed to reset password");
      }
    } catch (error) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">Reset Your Password</h2>
          <p className="text-sm text-gray-600 mb-4">
            Enter the 6-digit code sent to your email along with your new password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email Address</label>
              <Input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">6-Digit Code</label>
              <Input 
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="Enter 6-digit code from email"
                maxLength={6}
                className="text-center text-lg tracking-widest"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">New Password</label>
              <Input 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Confirm New Password</label>
              <Input 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
            
            {error && (
              <div className="text-sm text-red-600 p-3 bg-red-50 rounded">
                {error}
              </div>
            )}
            
            {message && (
              <div className="text-sm text-green-600 p-3 bg-green-50 rounded">
                {message}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={loading || !email || !otpCode || !newPassword || !confirmPassword}
                className="flex-1"
              >
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
              <Button 
                type="button" 
                variant="outline"
                onClick={() => router.push('/login')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}