import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { exitKioskMode, kioskLogout } from "./kiosk";
import type { PluginNavItem } from "./plugin-types";
import { useKiosk } from "./use-auth";

export function NavBar({ items }: { items: PluginNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kiosk = useKiosk();

  // Kiosk sessions have no admin rights — don't offer the page at all.
  const visibleItems = kiosk.active ? items.filter((item) => item.to !== "/admin") : items;

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => setVisible(true));
  }

  function closeMenu() {
    setVisible(false);
    timerRef.current = setTimeout(() => setOpen(false), 200);
  }

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative text-sm font-medium transition-colors py-4 ${
      isActive
        ? "text-crimson after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-crimson"
        : "text-steel-dark hover:text-ink"
    }`;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-paper border-b border-steel/25 px-6 flex items-center gap-8 h-14">
        <Link to="/" className="font-display text-2xl text-crimson tracking-wide leading-none">
          G3 SHOP
        </Link>

        <div className="hidden md:flex items-center gap-7 h-full">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>

        {kiosk.active ? (
          <div className="ml-auto flex items-center gap-2">
            <KioskBadge machineName={kiosk.machineName} />
            <button
              type="button"
              onClick={() => kioskLogout()}
              className="text-sm font-semibold text-paper bg-crimson hover:bg-crimson-dark rounded-lg px-3.5 py-2 transition-colors"
            >
              Log Out
            </button>
          </div>
        ) : (
          <>
            <a
              className="hidden md:block ml-auto text-sm font-medium text-steel-dark hover:text-ink transition-colors"
              href="https://web.g3robotics.com"
            >
              All Apps
            </a>

            <div className="ml-auto md:hidden">
              <button
                type="button"
                className="flex flex-col gap-1.5 p-1 group"
                onClick={() => (open ? closeMenu() : openMenu())}
                aria-label="Toggle menu"
              >
                <span
                  className={`block w-6 h-0.5 bg-ink group-hover:bg-crimson transition-all duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
                />
                <span
                  className={`block w-6 h-0.5 bg-ink group-hover:bg-crimson transition-all duration-200 ${open ? "opacity-0" : ""}`}
                />
                <span
                  className={`block w-6 h-0.5 bg-ink group-hover:bg-crimson transition-all duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
                />
              </button>
            </div>
          </>
        )}
      </nav>

      {open && !kiosk.active && (
        <div
          className={`fixed inset-0 z-40 bg-paper flex flex-col px-8 pt-24 gap-8 md:hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className="text-2xl font-bold text-ink hover:text-crimson transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <a
            className="text-2xl font-bold text-ink hover:text-crimson transition-colors"
            href="https://web.g3robotics.com"
          >
            All Apps
          </a>
        </div>
      )}
    </>
  );
}

/** Machine name chip shown in kiosk mode; clicking it reveals the exit control. */
function KioskBadge({ machineName }: { machineName: string | null }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-steel-dark bg-steel-tint border border-steel/40 hover:border-crimson/50 rounded-lg px-3.5 py-2 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
        {machineName ?? "Kiosk"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-paper border border-steel/30 rounded-xl shadow-lg p-3 w-56 space-y-2">
          <p className="text-xs text-steel">
            This device is in kiosk mode{machineName ? ` as “${machineName}”` : ""}.
          </p>
          <button
            type="button"
            onClick={() => exitKioskMode()}
            className="w-full text-sm font-semibold text-crimson border border-crimson/50 hover:bg-crimson-tint rounded-lg px-3 py-2 transition-colors"
          >
            Exit Kiosk Mode
          </button>
        </div>
      )}
    </div>
  );
}
