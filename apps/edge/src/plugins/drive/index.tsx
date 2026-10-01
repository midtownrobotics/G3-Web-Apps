import type { Plugin } from "../../shared/plugin-types";
import { DrivePage } from "./drive-page";

export const drivePlugin: Plugin = {
  name: "drive",
  routes: [{ path: "/drive", element: <DrivePage /> }],
  navItems: [{ label: "Drive", to: "/drive", order: 60, group: "Drive" }],
};
