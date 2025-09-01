"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+44 ");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [receiveUpdates, setReceiveUpdates] = useState(true);
  const [receiveMatchNotifications, setReceiveMatchNotifications] = useState(true);
  const [receiveMarketing, setReceiveMarketing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          name, 
          phone, 
          password, 
          notificationPreferences: {
            receiveUpdates,
            receiveMatchNotifications,
            receiveMarketing
          }
        }),
      });

      if (response.ok) {
        // Auto-login after successful registration
        const signInRes = await signIn("credentials", { 
          email, 
          password, 
          redirect: false 
        });
        
        if (signInRes?.ok) {
          router.push('/');
        } else {
          router.push('/login?message=Account created! Please log in.');
        }
      } else {
        const data = await response.json();
        setError(data.error || 'Registration failed');
      }
    } catch (error) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-2xl font-semibold mb-6 text-center">Create Account</h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name (optional)</label>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Your name" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Phone (optional)</label>
              <Input 
                type="tel"
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                placeholder="+44 7123 456789" 
              />
            </div>

            
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <Input 
                type="email"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="you@example.com" 
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Password *</label>
              <Input 
                type="password"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="••••••••" 
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Confirm Password *</label>
              <Input 
                type="password"
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                placeholder="••••••••" 
                required
              />
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-medium">Notification Preferences</label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="updates"
                    checked={receiveUpdates}
                    onCheckedChange={setReceiveUpdates}
                  />
                  <label htmlFor="updates" className="text-sm">
                    Receive updates about the tennis ladder
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="matches"
                    checked={receiveMatchNotifications}
                    onCheckedChange={setReceiveMatchNotifications}
                  />
                  <label htmlFor="matches" className="text-sm">
                    Receive match notifications and reminders
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="marketing"
                    checked={receiveMarketing}
                    onCheckedChange={setReceiveMarketing}
                  />
                  <label htmlFor="marketing" className="text-sm">
                    Receive occasional marketing and info emails (optional)
                  </label>
                </div>
              </div>
            </div>
            
            {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
            
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          
          <div className="mt-4 text-center">
            <a href="/login" className="text-sm text-blue-600 hover:underline">
              Already have an account? Sign in
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}