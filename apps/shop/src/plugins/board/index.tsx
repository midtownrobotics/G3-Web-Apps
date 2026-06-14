import type { Plugin } from "../../shared/plugin-types";
import { BoardPage } from "./board-page";

export const boardPlugin: Plugin = {
  name: "board",
  routes: [{ path: "/board", element: <BoardPage /> }],
  navItems: [{ label: "Shop Floor", to: "/board", order: 2 }],
};
