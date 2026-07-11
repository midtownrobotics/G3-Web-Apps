import type { Plugin } from "../../shared/plugin-types";
import { DrawingUploadPage } from "./drawing-upload-page";

export const drawingsPlugin: Plugin = {
  name: "drawings",
  routes: [
    { path: "/drawings/:partNumber", element: <DrawingUploadPage /> },
  ],
  navItems: [],
};
