import type { Plugin } from "../../shared/plugin-types";
import { PartDetailPage } from "./part-detail-page";
import { PartsPage } from "./parts-page";

export const partsPlugin: Plugin = {
  name: "parts",
  routes: [
    { path: "/parts", element: <PartsPage /> },
    { path: "/parts/:id", element: <PartDetailPage /> },
  ],
  navItems: [{ label: "Parts", to: "/parts", order: 1 }],
};
