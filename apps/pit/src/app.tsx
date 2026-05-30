import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { plugins } from "./plugins.config";
import { NavBar } from "./shared/nav-bar";
import { OfflineBanner } from "./shared/offline-banner";
import { prefetchAll } from "./shared/prefetch";

export function App() {
  const allRoutes = plugins.flatMap((p) => p.routes);
  const navItems = plugins.flatMap((p) => p.navItems ?? []).sort((a, b) => a.order - b.order);

  useEffect(() => {
    prefetchAll().catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <NavBar items={navItems} />
      <OfflineBanner />
      <Routes>
        {allRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>
    </BrowserRouter>
  );
}
