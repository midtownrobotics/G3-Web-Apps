import type { Plugin } from "../../shared/plugin-types";
import { ClientDetailPage } from "./client-detail-page";
import { ClientsPage } from "./clients-page";
import { OverviewPage } from "./overview-page";

export const networkPlugin: Plugin = {
  name: "network",
  routes: [
    { path: "/network", element: <OverviewPage /> },
    { path: "/network/clients", element: <ClientsPage /> },
    { path: "/network/clients/:mac", element: <ClientDetailPage /> },
  ],
  navItems: [
    { label: "Overview", to: "/network", order: 10, group: "Network" },
    { label: "Clients", to: "/network/clients", order: 11, group: "Network" },
  ],
};
