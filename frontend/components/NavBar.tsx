"use client";

import React from "react";
import Link from "next/link";

export default function NavBar() {
  return (
    <nav className="w-full h-20 border-b border-gray-100 flex items-center justify-between px-12 bg-white sticky top-0 z-50">
      <Link href="/" className="text-xl font-bold tracking-tighter font-mono text-orange-500">
        TRUEVOICE
      </Link>
      <div className="flex gap-8 text-[11px] uppercase tracking-widest font-bold text-gray-500">
        <Link href="/" className="hover:text-orange-500 transition-colors">Home</Link>
        <Link href="/about" className="hover:text-orange-500 transition-colors">About</Link>
        <Link href="/online" className="hover:text-orange-500 transition-colors">Online</Link>
        <Link href="/in-person" className="hover:text-orange-500 transition-colors">In-Person</Link>
      </div>
    </nav>
  );
}