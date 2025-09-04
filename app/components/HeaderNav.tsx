"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import MobileNav from "./MobileNav";

interface HeaderNavProps {
  session: any;
}

export default function HeaderNav({ session }: HeaderNavProps) {
  const [showMobileWelcome, setShowMobileWelcome] = useState(false);

  // Check if mobile welcome should be shown on first load
  useEffect(() => {
    if (session && typeof window !== 'undefined') {
      const hasSeenWelcome = localStorage.getItem('hasSeenMobileWelcome');
      const isMobile = window.innerWidth < 768;
      
      if (!hasSeenWelcome && isMobile) {
        setShowMobileWelcome(true);
      }
    }
  }, [session]);

  const handleWelcomeClose = () => {
    setShowMobileWelcome(false);
    localStorage.setItem('hasSeenMobileWelcome', 'true');
  };

  const handleShowWelcome = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowMobileWelcome(true);
    }
  };

  // Mobile Welcome Screen
  if (showMobileWelcome) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{
          backgroundImage: 'url(/tennis-club-background.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="bg-white/85 backdrop-blur-sm rounded-lg shadow-xl p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h2>
            <p className="text-gray-600 text-sm">
              Choose which page you'd like to visit first.
            </p>
          </div>
          
          <div className="space-y-3">
            <Link
              href="/"
              className="flex items-center gap-3 w-full p-3 text-left rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
              onClick={handleWelcomeClose}
            >
              <span className="text-xl">📅</span>
              <div>
                <div className="font-medium text-gray-900">Calendar</div>
                <div className="text-xs text-gray-600">View and manage matches</div>
              </div>
            </Link>
            
            <Link
              href="/opponents"
              className="flex items-center gap-3 w-full p-3 text-left rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
              onClick={handleWelcomeClose}
            >
              <span className="text-xl">🤝</span>
              <div>
                <div className="font-medium text-gray-900">Opponents</div>
                <div className="text-xs text-gray-600">See your opponents and stats</div>
              </div>
            </Link>
            
            <Link
              href="/scoring"
              className="flex items-center gap-3 w-full p-3 text-left rounded-lg bg-yellow-50 border border-yellow-200 hover:bg-yellow-100 transition-colors"
              onClick={handleWelcomeClose}
            >
              <span className="text-xl">🏆</span>
              <div>
                <div className="font-medium text-gray-900">Scoring</div>
                <div className="text-xs text-gray-600">Enter match results</div>
              </div>
            </Link>
            
            <Link
              href="/ladder"
              className="flex items-center gap-3 w-full p-3 text-left rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 transition-colors"
              onClick={handleWelcomeClose}
            >
              <span className="text-xl">📊</span>
              <div>
                <div className="font-medium text-gray-900">Whole Ladder</div>
                <div className="text-xs text-gray-600">View ladder standings</div>
              </div>
            </Link>
          </div>
          
          <button
            onClick={handleWelcomeClose}
            className="w-full mt-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Close Menu
          </button>
        </div>
      </div>
    );
  }

  // Regular header
  return (
    <header className="flex items-center justify-between mb-4">
      <h1 
        className="text-xl font-bold cursor-pointer hover:text-blue-600 transition-colors"
        onClick={handleShowWelcome}
      >
        Doubles Tennis Ladder
      </h1>

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
  );
}