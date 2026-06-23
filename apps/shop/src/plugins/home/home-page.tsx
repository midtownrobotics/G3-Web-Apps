import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../shared/api";
import { buildInstanceRows } from "../../shared/derive";
import { useShopData } from "../../shared/use-shop-data";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const [name, setName] = useState<string>();
  const { data } = useShopData();

  useEffect(() => {
    api.me
      .$get()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setName(data?.displayName))
      .catch(() => setName(undefined));
  }, []);

  const rows = data ? buildInstanceRows(data) : [];
  const doing = rows.filter((r) => r.state === "doing").length;
  const todo = rows.filter((r) => r.state === "todo").length;
  const complete = rows.filter((r) => r.state === "complete").length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-mist">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <div>
          <p className="text-sm text-steel-dark">{today}</p>
          <h1 className="font-display text-5xl text-ink mt-1">
            {greeting()}
            {name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-steel-dark mt-2">G3 Shop — production tracking and management.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="In Progress" value={data ? doing : null} accent="text-amber-600" />
          <Stat label="Ready to Start" value={data ? todo : null} accent="text-crimson" />
          <Stat label="Completed Parts" value={data ? complete : null} accent="text-green-600" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickLink
            to="/parts"
            title="Parts"
            blurb="Browse every part in production, add new ones, and check status."
          />
          <QuickLink
            to="/board"
            title="Shop Floor"
            blurb="See what each machine is working on and move parts forward."
          />
          <QuickLink
            to="/admin"
            title="Admin"
            blurb="Manage stale parts, subsystems, and shop processes."
          />
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: string;
}) {
  return (
    <div className="bg-paper border border-steel/25 rounded-xl px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-steel">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value ?? "—"}</p>
    </div>
  );
}

function QuickLink({ to, title, blurb }: { to: string; title: string; blurb: string }) {
  return (
    <Link
      to={to}
      className="group bg-paper border border-steel/25 hover:border-crimson/50 rounded-xl px-5 py-4 transition-colors"
    >
      <p className="font-display text-2xl text-ink group-hover:text-crimson transition-colors">
        {title}
      </p>
      <p className="text-sm text-steel-dark mt-1">{blurb}</p>
    </Link>
  );
}
