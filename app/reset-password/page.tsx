"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No reset token provided");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("No reset token provided");
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
        body: JSON.stringify({ token, newPassword }),
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

  if (!token) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <Card>
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Invalid Reset Link</h2>
            <p className="text-muted-foreground mb-4">
              The reset link is invalid or missing. Please request a new password reset.
            </p>
            <Button onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-10">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4">Reset Your Password</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                disabled={loading || !newPassword || !confirmPassword}
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