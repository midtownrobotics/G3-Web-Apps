import { Link } from "react-router-dom";
import type { PluginNavItem } from "./plugin-types";

export function NavBar({ items }: { items: PluginNavItem[] }) {
  return (
    <nav className="bg-gray-900 text-white px-6 py-4 flex items-center gap-6">
      <span className="font-bold text-red-400 mr-4 tracking-tight">G3ID</span>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="text-sm text-gray-300 hover:text-red-400 transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
