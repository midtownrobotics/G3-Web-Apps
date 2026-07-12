import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import type { PluginNavItem } from "./plugin-types";

export function NavBar({ items }: { items: PluginNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>

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
      </nav>

      {open && (
        <div
          className={`fixed inset-0 z-40 bg-paper flex flex-col px-8 pt-24 gap-8 md:hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {items.map((item) => (
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
