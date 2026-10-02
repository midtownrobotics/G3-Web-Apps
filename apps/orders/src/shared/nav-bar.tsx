import { Fragment } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuthUser } from "./auth";
import type { PluginNavItem } from "./plugin-types";

/** Top bar. Items are grouped by module (e.g. "Orders", "Admin"). */
export function NavBar({ items }: { items: PluginNavItem[] }) {
  const user = useAuthUser();
  const groups = new Map<string, PluginNavItem[]>();
  for (const item of items) {
    if (item.mentorOnly && !user.isMentor) continue;
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? "text-primary-500" : "text-secondary-500 hover:text-secondary-900"
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-secondary-200 px-4 sm:px-6 flex items-center gap-6 h-14 overflow-x-auto">
      <Link
        to="/"
        className="font-display text-2xl text-primary-500 tracking-wide leading-none shrink-0"
      >
        G3 ORDERS
      </Link>
      {[...groups].map(([group, groupItems], i) => (
        <Fragment key={group}>
          {i > 0 && <span className="h-5 w-px bg-secondary-200 shrink-0" aria-hidden />}
          <div className="flex items-center gap-4">
            {group && (
              <span className="text-xs font-bold uppercase tracking-widest text-secondary-300">
                {group}
              </span>
            )}
            {groupItems.map((item) => (
              <NavLink key={item.to} to={item.to} end className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </Fragment>
      ))}
      <a
        className="ml-auto text-sm font-medium text-secondary-500 hover:text-secondary-900 transition-colors whitespace-nowrap"
        href="https://web.g3robotics.com"
      >
        All Apps
      </a>
    </nav>
  );
}
