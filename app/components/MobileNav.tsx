"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Calendar", emoji: "📅" },
    { href: "/opponents", label: "Opponents", emoji: "🤝" },
    { href: "/scoring", label: "Scoring", emoji: "🏆" },
    { href: "/ladder", label: "Whole Ladder", emoji: "📊" },
    { href: "/profile", label: "Profile", emoji: "👤" },
    { href: "/help", label: "Help", emoji: "❓" },
  ];

  return (
    <div className="md:hidden absolute right-4">
      {/* Umpire Chair Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-center items-center w-8 h-8 focus:outline-none"
      >
        {isOpen ? (
          // X when open
          <div className="relative w-5 h-5">
            <div className="w-5 h-0.5 bg-gray-800 rotate-45 absolute top-1/2 left-0 transform -translate-y-1/2" />
            <div className="w-5 h-0.5 bg-gray-800 -rotate-45 absolute top-1/2 left-0 transform -translate-y-1/2" />
          </div>
        ) : (
          // Umpire Chair when closed  
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Legs */}
            <line x1="8" y1="26" x2="14" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="24" y1="26" x2="18" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            
            {/* Steps */}
            <line x1="10" y1="20" x2="22" y2="20" stroke="currentColor" strokeWidth="2"/>
            <line x1="11.5" y1="14" x2="20.5" y2="14" stroke="currentColor" strokeWidth="2"/>
            
            {/* Seat */}
            <rect x="13.5" y="6.5" width="5" height="3" fill="currentColor" rx="0.5"/>
            
            {/* Backrest */}
            <rect x="12.5" y="3" width="7" height="3" fill="currentColor" rx="0.5"/>
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-25 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu */}
          <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-lg border py-2 z-50 min-w-[180px]">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                  pathname === item.href 
                    ? 'text-blue-600 font-medium bg-blue-50' 
                    : 'text-gray-700'
                }`}
              >
                <span className="text-base">{item.emoji}</span>
                {item.label}
              </Link>
            ))}
            
            {/* Divider */}
            <div className="border-t my-2"></div>
            
            {/* Logout */}
            <a
              href="/api/auth/signout"
              className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="text-base">🚪</span>
              Log Out
            </a>
          </div>
        </>
      )}
    </div>
  );
}