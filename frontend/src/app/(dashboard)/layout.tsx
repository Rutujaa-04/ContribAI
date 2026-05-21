import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GitBranch, LogOut } from "lucide-react";
import SidebarNav from "@/components/SidebarNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#080B10] flex text-foreground">
      {/* Sidebar background blobs for extra depth */}
      <div className="fixed top-0 left-0 w-60 h-screen overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[120%] h-[40%] bg-gradient-to-br from-blue-500/5 to-cyan-500/0 rounded-full blur-[80px]" />
      </div>

      <aside className="w-60 bg-[#090C12]/90 backdrop-blur-xl border-r border-white/[0.04] flex flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
        {/* Brand Header */}
        <div className="px-6 py-6 border-b border-white/[0.04]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.35)] relative overflow-hidden group">
              <span className="absolute inset-0 bg-gradient-to-tr from-cyan-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <GitBranch className="w-4.5 h-4.5 text-white relative z-10 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-300 text-sm tracking-tight">ContribAI</span>
              <span className="text-[10px] text-blue-400/80 font-mono tracking-widest font-semibold uppercase leading-none mt-0.5">Redux Edition</span>
            </div>
          </div>
        </div>

        {/* Dynamic Sidebar Links */}
        <SidebarNav />

        {/* Bottom Profile Section */}
        <div className="p-4 border-t border-white/[0.04] space-y-3 bg-[#090C12]/50">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.04] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] relative group hover:border-white/[0.08] transition-all duration-300">
            {session.user.image ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={session.user.image} 
                  alt={session.user.name ?? "User"} 
                  className="w-8 h-8 rounded-full ring-2 ring-blue-500/20 group-hover:ring-blue-500/40 transition-all duration-300" 
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#090C12] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600/10 flex items-center justify-center text-blue-400 font-bold text-xs ring-2 ring-blue-500/20">
                {session.user.name?.charAt(0) || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{session.user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate font-mono">@{session.user.username}</p>
            </div>
          </div>

          <Link 
            href="/api/auth/signout" 
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-300 w-full group"
          >
            <LogOut className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Sign Out</span>
          </Link>
        </div>
      </aside>
      
      {/* Page Canvas Container */}
      <main className="flex-1 ml-60 p-8 min-h-screen relative z-10">
        {children}
      </main>
    </div>
  );
}