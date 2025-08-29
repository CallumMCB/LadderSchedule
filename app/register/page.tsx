"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
        body: JSON.stringify({ email, name, phone, password }),
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
                placeholder="+1 (555) 123-4567" 
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