import type { Plugin } from "../../shared/plugin-types";
import { AdminKioskPage } from "./admin-kiosk-page";
import { AdminUsersPage } from "./admin-users-page";

export const adminPlugin: Plugin = {
  name: "admin",
  routes: [
    { path: "/admin/users", element: <AdminUsersPage /> },
    { path: "/admin/kiosk", element: <AdminKioskPage /> },
  ],
  navItems: [],
};
