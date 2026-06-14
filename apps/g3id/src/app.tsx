import { BrowserRouter, Route, Routes } from "react-router-dom";
import { plugins } from "./plugins.config";
import { NavBar } from "./shared/nav-bar";
import { RedirectInfo } from "./shared/redirect-info";

export function App() {
  const allRoutes = plugins.flatMap((p) => p.routes);
  const navItems = plugins.flatMap((p) => p.navItems ?? []).sort((a, b) => a.order - b.order);

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-secondary-900">
        <NavBar items={navItems} />
        <RedirectInfo />
        <div className="flex flex-col flex-1">
          <Routes>
            {allRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
