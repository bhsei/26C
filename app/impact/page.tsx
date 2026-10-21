import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import DashboardShell from "@/app/components/DashboardShell";
import { settleUnavailableOrders } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ImpactPage() {
  const supervisor = await requireRole("SUPERVISOR");
  await settleUnavailableOrders();

  const membership = await prisma.diningHallMember.findFirst({
    where: { userId: supervisor.id, relation: { in: ["OWNER", "SUPERVISOR"] } },
    select: { diningHallId: true },
  });

  if (!membership?.diningHallId) {
    return <DashboardShell user={supervisor} active="impact"><div className="p-8">No dining hall assignment found.</div></DashboardShell>;
  }

  const listings = await prisma.listing.findMany({
    where: { diningHallId: membership.diningHallId },
    include: { foodItem: true, orderItems: { include: { order: { include: { items: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const orders = listings.flatMap((listing) => listing.orderItems.map((item) => item.order));
  const pickedUp = orders.filter((order) => order.status === "PICKED_UP");
  const meals = pickedUp.reduce((total, order) => total + order.items.reduce((sum: number, item) => sum + item.quantity, 0), 0);
  const savings = pickedUp.reduce((total, order) => total + order.items.reduce((sum: number, item) => sum + (item.originalPriceCents - item.finalPriceCents) * item.quantity, 0), 0);
  const recoveredValue = pickedUp.reduce((total, order) => total + order.items.reduce((sum: number, item) => sum + item.finalPriceCents * item.quantity, 0), 0);

  const week = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - 6 + index);
    const count = pickedUp.filter((order) => order.pickedUpAt?.toDateString() === day.toDateString()).reduce((total, order) => total + order.items.reduce((sum: number, item) => sum + item.quantity, 0), 0);
    return { day, count };
  });

  const max = Math.max(1, ...week.map((entry) => entry.count));

  return <DashboardShell user={supervisor} active="impact">
    <div className="welcome-row"><div><p className="eyebrow">SUPERVISOR REPORT</p><h1>Impact Report <span>✳</span></h1><p className="subtitle">See how your dining hall turns surplus meals into community value.</p></div></div>
    <section className="stats-grid impact-stats"><article className="stat-card featured"><div className="stat-head"><span>Meals rescued</span><span className="stat-icon">✳</span></div><strong>{meals.toLocaleString()}</strong><div className="stat-caption">Confirmed student pickups</div></article><article className="stat-card"><div className="stat-head"><span>Student savings</span><span className="stat-icon">＄</span></div><strong>{money(savings)}</strong><div className="stat-caption">Compared with regular menu prices</div></article><article className="stat-card"><div className="stat-head"><span>Food value recovered</span><span className="stat-icon">◈</span></div><strong>{money(recoveredValue)}</strong><div className="stat-caption">Revenue from picked up meals</div></article><article className="stat-card"><div className="stat-head"><span>Estimated CO₂ avoided</span><span className="stat-icon">♧</span></div><strong>{(meals * 0.8).toFixed(1)} kg</strong><div className="stat-caption">Estimate of 0.8 kg per rescued meal</div></article></section>
    <section className="panel impact-report-panel"><div className="panel-heading"><div><h2>Meals rescued this week</h2><p>Counted when a supervisor confirms pickup.</p></div><span className="period-select">Last 7 days</span></div><div className="bar-chart impact-chart" role="img" aria-label="Meals picked up each day this week">{week.map(({ day, count }) => <div className="bar-col" key={day.toISOString()}><span className="bar-value">{count}</span><div className="bar bar-highlight" style={{ height: `${Math.max(count ? 12 : 3, count / max * 100)}%` }}/><span className="bar-label">{day.toLocaleDateString("en-US", { weekday: "short" })}</span></div>)}</div></section>
    <section className="panel report-explainer"><span className="impact-badge">✳</span><div><h2>Why this report matters</h2><p>It helps supervisors track meals students actually picked up, money saved by diners, and the estimated environmental benefit of serving surplus food instead of throwing it away. Counts update as pickup status is confirmed.</p></div></section>
  </DashboardShell>;
}
