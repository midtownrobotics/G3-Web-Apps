import type { Plugin } from "../../shared/plugin-types";
import { AddPartPage } from "./add-part-page";
import { PartsPage } from "./parts-page";

export const partsPlugin: Plugin = {
  name: "parts",
  routes: [
    { path: "/parts", element: <PartsPage /> },
    { path: "/parts/new", element: <AddPartPage /> },
  ],
  navItems: [{ label: "Parts", to: "/parts", order: 1 }],
};
