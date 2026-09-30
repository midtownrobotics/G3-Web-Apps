import type { Plugin } from "../../shared/plugin-types";
import { AnalyticsPage } from "./analytics-page";

export const analyticsPlugin: Plugin = {
  name: "analytics",
  routes: [{ path: "/analytics", element: <AnalyticsPage /> }],
  navItems: [{ label: "Analytics", to: "/analytics", order: 4 }],
};
