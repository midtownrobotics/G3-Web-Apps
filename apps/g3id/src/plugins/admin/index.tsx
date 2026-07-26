import type { Plugin } from "../../shared/plugin-types";
import { AdminAttendancePage } from "./admin-attendance-page";
import { AdminKioskPage } from "./admin-kiosk-page";
import { AdminUsersPage } from "./admin-users-page";

export const adminPlugin: Plugin = {
  name: "admin",
  routes: [
    { path: "/admin/users", element: <AdminUsersPage /> },
    { path: "/admin/kiosk", element: <AdminKioskPage /> },
    { path: "/admin/attendance", element: <AdminAttendancePage /> },
  ],
  navItems: [],
};
