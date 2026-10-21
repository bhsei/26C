import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/auth-actions";
import ChatWidget from "@/app/components/ChatWidget";
import prisma from "@/lib/prisma";
import type { User } from "../generated/prisma/client";
import Notifications from "@/app/components/Notifications";

type Section = "overview" | "orders" | "listings" | "impact";

export default async function DashboardShell({
  user,
  active,
  children,
}: {
  user: User | null;
  active: Section;
  children: ReactNode;
}) {
  const supervisor = user?.role === "SUPERVISOR";
  const assignedHall = supervisor && user.diningHallId
    ? await prisma.diningHall.findUnique({ where: { id: user.diningHallId }, select: { name: true } })
    : null;
  const hallLabel = assignedHall?.name ?? "No dining hall assigned";
  const nav = [
    { key: "overview" as const, href: "/", icon: "▦", label: "Overview", show: true },
    { key: "orders" as const, href: "/orders", icon: "↗", label: "Reserve Orders", show: true },
    { key: "listings" as const, href: "/merchant", icon: "◈", label: "Publish Listings", show: supervisor },
    { key: "impact" as const, href: "/impact", icon: "◎", label: "Impact Report", show: supervisor },
  ].filter((item) => item.show);

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>Second<span className="brand-light">Helping</span><small>MARKETPLACE</small></span>
        </Link>
        <div className="side-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace">
          {nav.map((item) => <Link key={item.key} className={`side-link ${active === item.key ? "selected" : ""}`} href={item.href}><span>{item.icon}</span>{item.label}</Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="impact-mini"><span className="leaf-icon">✳</span><p>Good food deserves<br />a second helping.</p><small>Meals saved from waste</small><strong>Make every meal count</strong></div>
          {user ? <div className="user-row"><span className="avatar">{(user.name ?? "SH").slice(0, 2).toUpperCase()}</span><span className="user-row-info" title={supervisor ? `Supervisor · ${hallLabel}` : "Student account"}><b>{user.name ?? "SecondHelping user"}</b><small>{supervisor ? `Supervisor · ${hallLabel}` : "Student account"}</small></span><form action={logout}><button className="more" aria-label="Log out" title="Log out">↪</button></form></div> : <Link href="/login" className="user-row"><span className="avatar">SH</span><span><b>Welcome</b><small>Sign in to your account</small></span><span className="more">↗</span></Link>}
        </div>
      </aside>
      <section className="dashboard-main">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <b>{nav.find((item) => item.key === active)?.label}</b>
          </div>
          
          <div className="top-actions">
            {user && <Notifications />}
            
            {user ? (
              <span className="live-pill" title={supervisor ? `Assigned dining hall: ${hallLabel}` : undefined}>
                <i /> {supervisor ? `Supervisor · ${hallLabel}` : "Student account"}
              </span>
            ) : (
              <span className="live-pill"><i /> Browse as guest</span>
            )}
            
            {user ? (
              <form action={logout}>
                <button className="sign-in" type="submit">Sign out <span>↗</span></button>
              </form>
            ) : (
              <Link className="sign-in" href={`/login?next=${active === "orders" ? "/orders" : "/"}`}>
                Sign in <span>↗</span>
              </Link>
            )}
          </div>
        </header>
        <div className="page-content">{children}<footer className="footer"><span>© 2026 SecondHelping</span><span>Making good food go further <b>✳</b></span></footer></div>
      </section>
      {user ? <ChatWidget /> : null}
    </main>
  );
}
