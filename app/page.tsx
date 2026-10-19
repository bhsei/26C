import Link from "next/link";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import DashboardShell from "@/app/components/DashboardShell";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";
import type { OrderStatus } from "./generated/prisma/client";

export const dynamic = "force-dynamic";
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  RESERVED: "Reserved",
  PICKED_UP: "Picked up",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};
const statusClass: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "status-pending",
  RESERVED: "status-reserved",
  PICKED_UP: "status-complete",
  CANCELLED: "status-cancelled",
  EXPIRED: "status-expired",
};

export default async function DashboardPage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const user = await getCurrentUser();
  await settleUnavailableOrders(now);
  const isSupervisor = user?.role === "SUPERVISOR";
  const hallId = user?.diningHallId ?? null;
  const hallScope = isSupervisor ? { listing: { is: { diningHallId: hallId ?? "" } } } : {};
  const listingScope = isSupervisor ? { diningHallId: hallId ?? "" } : {};
  const paidStatuses: OrderStatus[] = ["RESERVED", "PICKED_UP"];
  const [orders, listings, halls, recentOrders, dailyOrders] = await Promise.all([
    prisma.order.findMany({ where: { status: { in: paidStatuses }, ...hallScope }, select: { finalPriceCents: true, quantity: true, createdAt: true, status: true } }),
    prisma.listing.findMany({ where: listingScope, select: { quantityTotal: true, quantityRemaining: true, priceCents: true, createdAt: true, status: true } }),
    isSupervisor ? prisma.diningHall.count({ where: { id: hallId ?? "" } }) : prisma.diningHall.count(),
    prisma.order.findMany({ where: hallScope, take: 6, orderBy: { createdAt: "desc" }, include: { student: { select: { name: true } }, listing: { include: { food: true, diningHall: true } } } }),
    prisma.order.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }, status: { in: paidStatuses }, ...hallScope }, select: { createdAt: true, finalPriceCents: true } }),
  ]);
  const revenue = orders.reduce((sum, order) => sum + order.finalPriceCents * order.quantity, 0);
  const monthRevenue = orders.filter(order => order.createdAt >= monthStart).reduce((sum, order) => sum + order.finalPriceCents * order.quantity, 0);
  const mealsSaved = orders.filter(order => order.status === "PICKED_UP").reduce((sum, order) => sum + order.quantity, 0);
  const activeListings = listings.filter(listing => listing.status === "ACTIVE").length;
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    return { label: day.toLocaleDateString("en-US", { weekday: "short" }), value: dailyOrders.filter(order => order.createdAt.toDateString() === day.toDateString()).reduce((sum, order) => sum + order.finalPriceCents, 0) };
  });
  const max = Math.max(1, ...days.map(day => day.value));
  const orderCount = orders.length;
  return <DashboardShell user={user} active="overview">
    <div className="welcome-row"><div><p className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</p><h1>Good Morning, Beihang People <span>✳</span></h1><p className="subtitle">Here’s what’s happening across the surplus food marketplace.</p></div>{user?.role === "SUPERVISOR" && <Link className="primary-button" href="/merchant">＋ &nbsp; Publish listing</Link>}{!user && <Link className="primary-button" href="/login">Sign in to manage</Link>}</div>
    <section className="stats-grid"><article className="stat-card featured"><div className="stat-head"><span>Meal sales</span><span className="stat-icon">＄</span></div><strong>{money(revenue)}</strong><div className="stat-foot"><span>Paid meal sales; excludes refunded orders</span></div><div className="sparkline"><svg viewBox="0 0 220 42" preserveAspectRatio="none"><path d="M0 34 C20 33 20 21 41 25 S66 37 83 20 S109 28 126 17 S151 22 168 10 S194 18 220 2"/></svg></div></article>
    <article className="stat-card"><div className="stat-head"><span>Meals rescued</span><span className="stat-icon orange">✳</span></div><strong>{mealsSaved.toLocaleString()}</strong><div className="stat-foot"><span>Confirmed pickups</span></div><div className="stat-caption">Counts only after supervisor pickup confirmation.</div></article>
    <article className="stat-card"><div className="stat-head"><span>Paid orders</span><span className="stat-icon purple">▤</span></div><strong>{orderCount.toLocaleString()}</strong><div className="stat-foot"><span>{orders.length} order records</span></div><div className="stat-caption">Reserved and picked up; excludes refunds.</div></article>
    <article className="stat-card"><div className="stat-head"><span>Active listings</span><span className="stat-icon green">◈</span></div><strong>{activeListings}</strong><div className="stat-foot"><span className="neutral-tag">Across {halls} dining halls</span></div><div className="stat-caption">Fresh offers ready to be claimed.</div></article></section>
    <section className={`content-grid ${isSupervisor ? "" : "single-panel"}`}><article className="panel revenue-panel"><div className="panel-heading"><div><h2>Meal sales overview</h2><p>Sales from rescued meals over the last 7 days</p></div><span className="period-select">Last 7 days</span></div><div className="chart-summary"><strong>{money(monthRevenue)}</strong><span className="trend">↗ 12.8%</span><small> this month</small></div><div className="bar-chart" role="img" aria-label="Revenue chart for the last seven days">{days.map((day, index) => <div className="bar-col" key={day.label}><span className="bar-value">{day.value ? money(day.value) : "—"}</span><div className={`bar ${index === 5 ? "bar-highlight" : ""}`} style={{ height: `${Math.max(day.value ? 12 : 3, (day.value / max) * 100)}%` }}/><span className="bar-label">{day.label}</span></div>)}</div><div className="chart-legend"><span><i/> Revenue</span><span>Updated just now</span></div></article>
    {isSupervisor && <article className="panel impact-panel"><div className="panel-heading"><div><h2>Your community impact</h2><p>Small choices, meaningful change.</p></div><span className="impact-badge">✳</span></div><div className="impact-number">{mealsSaved.toLocaleString()} <span>meals</span></div><p className="impact-description">rescued from going to waste through SecondHelping.</p><div className="impact-divider"/><div className="impact-stat"><span>Estimated CO₂ avoided</span><b>{(mealsSaved * 0.8).toFixed(1)} <small>kg</small></b></div><div className="impact-stat"><span>Partner dining halls</span><b>{halls}</b></div><div className="impact-progress"><span style={{width:`${Math.min(100, Math.round(mealsSaved / Math.max(1, listings.reduce((sum,l)=>sum+l.quantityTotal,0))*100))}%`}}/></div><small className="progress-caption">Campus rescue goal</small></article>}</section>
    <section className="panel orders-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>The latest meals claimed by your community</p></div><Link className="view-all" href="/orders">View reserve orders <span>→</span></Link></div><div className="table-wrap"><table><thead><tr><th>ORDER</th><th>MEAL</th><th>CUSTOMER</th><th>LOCATION</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{recentOrders.map(order=><tr key={order.id}><td className="order-id">#{order.id.slice(-6).toUpperCase()}</td><td><span className="meal-dot">✳</span>{order.listing.food.name}</td><td>{order.student.name ?? "Student"}</td><td>{order.listing.diningHall.name}</td><td>{order.createdAt.toLocaleDateString("en-US", {month:"short",day:"numeric"})}</td><td className="amount">{money(order.finalPriceCents * order.quantity)}</td><td><span className={`status ${statusClass[order.status]}`}>● {statusLabel[order.status]}{order.refundedAt ? " · refunded" : ""}</span></td></tr>)}</tbody></table>{recentOrders.length === 0 && <p className="empty-state">No orders yet. Seed demo data to bring your dashboard to life.</p>}</div></section>
  </DashboardShell>;
}
