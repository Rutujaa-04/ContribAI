"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SidebarNav() {
  const pathname = usePathname();

  const links = [
    {
      href: "/discover",
      label: "Discover Issues",
      icon: Search,
    },
    {
      href: "/dashboard",
      label: "My Dashboard",
      icon: LayoutDashboard,
    },
  ];

  return (
    <nav className="flex-1 px-3 py-6 space-y-2">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 relative group overflow-hidden border border-transparent",
              isActive
                ? "text-white bg-gradient-to-r from-blue-600/15 to-indigo-600/5 border-blue-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03),0_4px_20px_rgba(59,130,246,0.08)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
            )}
          >
            {/* Active Indicator Bar */}
            {isActive && (
              <span className="absolute left-0 top-1/4 bottom-1/4 w-[3px] bg-gradient-to-b from-cyan-400 to-blue-500 rounded-r-full shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse" />
            )}
            
            {/* Subtle glow circle on hover */}
            <span className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl pointer-events-none" />

            <Icon className={cn("w-4.5 h-4.5 transition-transform duration-300 group-hover:scale-105", isActive ? "text-blue-400" : "text-muted-foreground group-hover:text-foreground")} />
            <span className="relative z-10">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
