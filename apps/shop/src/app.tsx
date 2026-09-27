import { BrowserRouter, Route, Routes } from "react-router-dom";
import { plugins } from "./plugins.config";
import { NavBar } from "./shared/nav-bar";
import { ProtectedRoute } from "./shared/protected-route";
import { VersionFooter } from "./shared/version-footer";
import { useKiosk, useAuthUser } from "./shared/use-auth";
import { useShopData } from "./shared/use-shop-data";
import { matchMachineProcess } from "./shared/derive";
import { BoardPage } from "./plugins/board/board-page";

function RegularApp() {
  const allRoutes = plugins.flatMap((p) => p.routes);
  const navItems = plugins.flatMap((p) => p.navItems ?? []).sort((a, b) => a.order - b.order);
  console.log("RegularApp rendering with", allRoutes.length, "routes");

  return (
    <BrowserRouter>
      <ProtectedRoute>
        <NavBar items={navItems} />
        <Routes>
          {allRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
        <VersionFooter />
      </ProtectedRoute>
    </BrowserRouter>
  );
}

function KioskApp() {
  const navItems = plugins.flatMap((p) => p.navItems ?? []).sort((a, b) => a.order - b.order);
  const { data } = useShopData();
  const kiosk = useKiosk();
  console.log("KioskApp rendering - kiosk.machineName:", kiosk.machineName, "data:", !!data);

  const hasMatchingMachine = data && matchMachineProcess(data.processes, kiosk.machineName);
  console.log("KioskApp - hasMatchingMachine:", hasMatchingMachine);

  return (
    <BrowserRouter>
      <ProtectedRoute>
        <NavBar items={navItems} />
        {hasMatchingMachine || !data ? (
          <BoardPage />
        ) : (
          <main className="min-h-screen bg-mist flex items-center justify-center">
            <div className="text-center space-y-4">
              <h1 className="font-display text-4xl text-ink">Device Not Configured</h1>
              <p className="text-lg text-steel">This kiosk device "{kiosk.machineName}" is not associated with any machine.</p>
              <p className="text-sm text-steel-dark">Please contact an administrator to configure this device.</p>
            </div>
          </main>
        )}
      </ProtectedRoute>
    </BrowserRouter>
  );
}

export function App() {
  const kiosk = useKiosk();
  const authUser = useAuthUser();
  console.log("App render - sessionType:", authUser?.sessionType, "kiosk.active:", kiosk.active, "kiosk:", kiosk);
  const result = kiosk.active ? <KioskApp /> : <RegularApp />;
  console.log("App rendering:", kiosk.active ? "KioskApp" : "RegularApp");
  return result;
}
