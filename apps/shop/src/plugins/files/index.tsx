import type { Plugin } from "../../shared/plugin-types";
import { FilesPage } from "./files-page";

export const filesPlugin: Plugin = {
  name: "files",
  routes: [{ path: "/files", element: <FilesPage /> }],
  navItems: [{ label: "Files", to: "/files", order: 2 }],
};
