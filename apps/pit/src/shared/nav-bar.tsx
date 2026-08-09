import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import type { PluginNavItem } from "./plugin-types";
import { useAuth } from "./use-auth";

export function NavBar({ items }: { items: PluginNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  const visibleItems = items.filter((item) => {
    if (item.requiresAdmin) return user?.isAdmin === true;
    if (item.requiresAuth) return user != null;
    return true;
  });

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
        ? "text-primary-500 after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-primary-500"
        : "text-secondary-600 hover:text-secondary-900"
    }`;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-secondary-200 px-6 flex items-center gap-8 h-14">
        <Link to="/" className="font-display text-2xl text-primary-500 tracking-wide leading-none">
          G3 PIT
        </Link>

        <div className="hidden md:flex items-center gap-7 h-full">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>

        <>
          <a
            className="hidden md:block ml-auto text-sm font-medium text-secondary-600 hover:text-secondary-900 transition-colors"
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
                className={`block w-6 h-0.5 bg-secondary-900 group-hover:bg-primary-500 transition-all duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
              />
              <span
                className={`block w-6 h-0.5 bg-secondary-900 group-hover:bg-primary-500 transition-all duration-200 ${open ? "opacity-0" : ""}`}
              />
              <span
                className={`block w-6 h-0.5 bg-secondary-900 group-hover:bg-primary-500 transition-all duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
              />
            </button>
          </div>
        </>
      </nav>

      {open && (
        <div
          className={`fixed inset-0 z-40 bg-white flex flex-col px-8 pt-24 gap-8 md:hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className="text-2xl font-display font-bold text-secondary-900 hover:text-primary-500 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <a
            className="text-2xl font-display font-bold text-secondary-900 hover:text-primary-500 transition-colors"
            href="https://web.g3robotics.com"
          >
            All Apps
          </a>
        </div>
      )}
    </>
  );
}
