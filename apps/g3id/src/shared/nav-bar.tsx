import { AppNavBar, isActivePath, linkWith } from "@g3/ui";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import type { PluginNavItem } from "./plugin-types";

const routerLink = linkWith(Link);

/**
 * The shared G3 top bar. Signed out: Log in and Sign up. Signed in: Dash, Admin for admins, and
 * All Apps.
 */
export function NavBar({ items }: { items: PluginNavItem[] }) {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const location = useLocation();

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

  const shown = items.filter((item) => {
    if (isLoggedIn === null) return false; // Loading
    if (isLoggedIn && (item.label === "Log in" || item.label === "Sign up")) return false;
    if (!isLoggedIn && item.label === "Dash") return false;
    return true;
  });
  const navItems = shown.map((item) => ({
    key: item.to,
    label: item.label,
    href: item.to,
    // The dashboard is the home page and also lives at /dashboard.
    active:
      item.to === "/"
        ? location.pathname === "/" || isActivePath(location.pathname, "/dashboard")
        : isActivePath(location.pathname, item.to),
  }));
  if (isAdmin) {
    navItems.push({
      key: "/admin",
      label: "Admin",
      href: "/admin/users",
      active: isActivePath(location.pathname, "/admin"),
    });
  }

  return (
    <AppNavBar
      title="G3ID"
      icon="/favicon.svg"
      link={routerLink}
      items={navItems}
      allApps={isLoggedIn === true}
    />
  );
}
