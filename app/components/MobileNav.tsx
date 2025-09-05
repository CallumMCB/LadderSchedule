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
    <div className="md:hidden absolute right-0">
      {/* Ladder/Umpire Chair Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col justify-center items-center w-8 h-8 focus:outline-none relative"
      >
        {isOpen ? (
          // X when open
          <div className="relative">
            <div className="w-5 h-0.5 bg-gray-800 rotate-45 absolute" />
            <div className="w-5 h-0.5 bg-gray-800 -rotate-45 absolute" />
          </div>
        ) : (
          // Ladder when closed  
          <div className="relative">
            {/* Vertical ladder sides */}
            <div className="w-0.5 h-6 bg-gray-800 absolute left-0" />
            <div className="w-0.5 h-6 bg-gray-800 absolute right-0" />
            {/* Horizontal ladder rungs */}
            <div className="w-4 h-0.5 bg-gray-800 absolute top-1" />
            <div className="w-4 h-0.5 bg-gray-800 absolute top-2.5" />
            <div className="w-4 h-0.5 bg-gray-800 absolute top-4" />
            <div className="w-4 h-0.5 bg-gray-800 absolute bottom-1" />
          </div>
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