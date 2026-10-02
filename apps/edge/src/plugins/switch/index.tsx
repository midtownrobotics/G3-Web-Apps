import type { Plugin } from "../../shared/plugin-types";
import { DoorSoundsPage } from "./sounds-page";

export const switchPlugin: Plugin = {
  name: "switch",
  routes: [{ path: "/door-sounds", element: <DoorSoundsPage /> }],
  navItems: [
    {
      label: "Door Sounds",
      to: "/door-sounds",
      order: 70,
      group: "Edge Box",
      adminOnly: true,
    },
  ],
};
