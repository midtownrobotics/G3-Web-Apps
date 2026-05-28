import { useEffect, useRef, useState } from "react";
import { BsFillPersonFill } from "react-icons/bs";
import { Link } from "react-router-dom";
import { g3id } from "../lib/api";
import type { PluginNavItem } from "./plugin-types";

const G3ID_LOGIN = `https://g3id.g3robotics.com/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`;

type Me = { displayName: string } | null;

function useMe(): Me | undefined {
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    g3id.auth.me
      .$get()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  return me;
}

export function NavBar({ items }: { items: PluginNavItem[] }) {
  const me = useMe();
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

  const visibleItems = items.filter((item) => !item.requiresAuth || me);

  return (
    <>
      {/* z-50 keeps the navbar on top of the overlay so the hamburger/X stays in place */}
      <nav className="relative z-50 bg-gray-900 text-white px-6 py-4 flex items-center gap-6">
        <span className="font-bold text-red-400 mr-4 tracking-tight">G3 Robotics</span>

        {/* Desktop links */}
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
        </div>

        <div className="ml-auto flex items-center gap-4">
          {/* Auth — desktop */}
          <div className="hidden md:block">
            {me === undefined ? null : me ? (
              <a
                className="text-sm text-gray-300 hover:text-red-400"
                href="https://g3id.g3robotics.com/"
              >
                Hello, {me.displayName}!
              </a>
            ) : (
              <a
                href={G3ID_LOGIN}
                className="flex items-center gap-2 text-sm text-gray-300 hover:text-red-400 transition-colors"
              >
                <p>Login</p>
                <BsFillPersonFill />
              </a>
            )}
          </div>

          {/* Hamburger — animates to X when open */}
          <button
            type="button"
            className="md:hidden flex flex-col gap-1.5 p-1 group"
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

      {/* Mobile full-screen menu — z-40 sits below the navbar */}
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

          <div className="mt-auto pb-10">
            {me === undefined ? null : me ? (
              <a
                className="text-2xl text-gray-400 hover:text-red-400"
                href="https://g3id.g3robotics.com/"
                onClick={closeMenu}
              >
                Hello, {me.displayName}!
              </a>
            ) : (
              <a
                href={G3ID_LOGIN}
                className="flex items-center gap-2 text-2xl text-gray-300 hover:text-red-400 transition-colors"
                onClick={closeMenu}
              >
                <p>Login</p>
                <BsFillPersonFill />
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
