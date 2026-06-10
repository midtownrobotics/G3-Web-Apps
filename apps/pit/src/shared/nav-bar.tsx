import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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

  return (
    <>
      <nav className="relative z-50 bg-gray-900 text-white px-6 py-4 flex items-center gap-6">
        <span className="font-bold text-red-400 mr-4 tracking-tight">G3 Pit</span>

        <div className="hidden md:flex items-center gap-6">
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm text-gray-300 hover:text-red-400 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          {user?.isAdmin == true && (
            <Link
              to="/admin"
              className="text-sm text-gray-300 hover:text-red-400 transition-colors"
            >
              Settings
            </Link>
          )}
          <a
            className="text-sm text-gray-300 hover:text-red-400 transition-colors"
            href="https://web.g3robotics.com/members"
          >
            All Apps
          </a>
        </div>

        <div className="ml-auto md:hidden">
          <button
            type="button"
            className="flex flex-col gap-1.5 p-1 group"
            onClick={() => (open ? closeMenu() : openMenu())}
            aria-label="Toggle menu"
          >
            <span
              className={`block w-6 h-0.5 bg-white group-hover:bg-red-400 transition-all duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-white group-hover:bg-red-400 transition-all duration-200 ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-white group-hover:bg-red-400 transition-all duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </button>
        </div>
      </nav>

      {open && (
        <div
          className={`fixed inset-0 z-40 bg-gray-900 flex flex-col px-8 pt-24 gap-8 md:hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {visibleItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className="text-2xl font-bold text-gray-100 hover:text-red-400 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          {user?.isAdmin === true && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className="text-2xl font-bold text-gray-100 hover:text-red-400 transition-colors"
            >
              Settings
            </Link>
          )}
          <a
            className="text-2xl font-bold text-gray-100 hover:text-red-400 transition-colors"
            href="https://web.g3robotics.com/members"
          >
            All Apps
          </a>
        </div>
      )}
    </>
  );
}
