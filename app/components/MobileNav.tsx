"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Calendar" },
    { href: "/opponents", label: "Opponents" },
    { href: "/scoring", label: "Scoring" },
    { href: "/ladder", label: "Whole Ladder" },
  ];

  return (
    <div className="md:hidden absolute left-1/2 transform -translate-x-1/2">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex flex-col justify-center items-center w-8 h-8 space-y-1 focus:outline-none"
      >
        <div className={`w-5 h-0.5 bg-gray-800 transition-transform duration-200 ${isOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
        <div className={`w-5 h-0.5 bg-gray-800 transition-opacity duration-200 ${isOpen ? 'opacity-0' : ''}`} />
        <div className={`w-5 h-0.5 bg-gray-800 transition-transform duration-200 ${isOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
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
          <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg border py-2 z-50 min-w-[160px]">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`block px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                  pathname === item.href 
                    ? 'text-blue-600 font-medium bg-blue-50' 
                    : 'text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}