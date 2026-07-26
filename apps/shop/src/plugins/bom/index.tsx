import type { Plugin } from "../../shared/plugin-types";
import { BomPage } from "./bom-page";

export const bomPlugin: Plugin = {
  name: "bom",
  routes: [{ path: "/bom", element: <BomPage /> }],
  navItems: [{ label: "BOM", to: "/bom", order: 5 }],
};
