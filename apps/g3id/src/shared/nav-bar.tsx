import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import type { PluginNavItem } from "./plugin-types";

export function NavBar({ items }: { items: PluginNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: location is used to trigger re-fetch on navigation
  useEffect(() => {
    api.auth.me.$get().then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { isAdmin?: boolean };
        setIsLoggedIn(true);
        setIsAdmin(data.isAdmin ?? false);
      } else {
        setIsLoggedIn(false);
        setIsAdmin(false);
      }
    });
  }, [location]);

  const filteredItems = items.filter((item) => {
    if (isLoggedIn === null) return false; // Loading
    if (isLoggedIn && (item.label === "Log in" || item.label === "Sign up")) return false;
    if (!isLoggedIn && item.label === "Dash") return false;
    return true;
  });

  return (
    <>
      <nav className="sticky top-0 z-50 bg-gray-800 px-6 flex items-center gap-8 h-14">
        <Link
          to="/"
          className="font-display text-2xl font-bold text-primary-400 tracking-wide leading-none"
        >
          G3ID
        </Link>

        <div className="hidden md:flex items-center gap-7 h-full">
          {filteredItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative text-sm font-medium text-gray-300 hover:text-white transition-colors py-4"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin/users"
              className="relative text-sm font-medium text-gray-300 hover:text-white transition-colors py-4"
            >
              Admin
            </Link>
          )}
          {isLoggedIn && (
            <a
              className="relative text-sm font-medium text-gray-300 hover:text-white transition-colors py-4"
              href="https://web.g3robotics.com"
            >
              All Apps
            </a>
          )}
        </div>

        <div className="ml-auto md:hidden">
          <button
            type="button"
            className="flex flex-col gap-1.5 p-1 group"
            onClick={() => (open ? closeMenu() : openMenu())}
            aria-label="Toggle menu"
          >
            <span
              className={`block w-6 h-0.5 bg-gray-300 group-hover:bg-primary-400 transition-all duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-gray-300 group-hover:bg-primary-400 transition-all duration-200 ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-6 h-0.5 bg-gray-300 group-hover:bg-primary-400 transition-all duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </button>
        </div>
      </nav>

      {open && (
        <div
          className={`fixed inset-0 z-40 bg-gray-800 flex flex-col px-8 pt-24 gap-8 md:hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {filteredItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className="text-2xl font-bold text-gray-300 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/admin/users"
              onClick={closeMenu}
              className="text-2xl font-bold text-gray-300 hover:text-white transition-colors"
            >
              Admin
            </Link>
          )}
          {isLoggedIn && (
            <a
              className="text-2xl font-bold text-gray-300 hover:text-white transition-colors"
              href="https://web.g3robotics.com"
            >
              All Apps
            </a>
          )}
        </div>
      )}
    </>
  );
}
