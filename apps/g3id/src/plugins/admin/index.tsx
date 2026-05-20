import type { Plugin } from "../../shared/plugin-types";
import { AdminUsersPage } from "./admin-users-page";

export const adminPlugin: Plugin = {
  name: "admin",
  routes: [{ path: "/admin/users", element: <AdminUsersPage /> }],
  navItems: [{ label: "Admin", to: "/admin/users", order: 10 }],
};
