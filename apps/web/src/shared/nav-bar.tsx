import { useEffect, useState } from "react";
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

  return (
    <nav className="bg-gray-900 text-white px-6 py-4 flex items-center gap-6">
      <span className="font-bold text-red-400 mr-4 tracking-tight">G3 Robotics</span>
      {items.map(
        (item) =>
          (!item.requiresAuth || me) && (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm text-gray-300 hover:text-red-400 transition-colors"
            >
              {item.label}
            </Link>
          ),
      )}
      <div className="ml-auto">
        {me === undefined ? null : me ? (
          <p className="text-sm text-gray-300">Hello, {me.displayName}!</p>
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
    </nav>
  );
}
