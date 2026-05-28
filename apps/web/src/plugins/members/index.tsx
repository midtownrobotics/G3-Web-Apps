import type { Plugin } from "../../shared/plugin-types";
import { MembersPage } from "./members-page";

export const membersPlugin: Plugin = {
  name: "members",
  routes: [{ path: "/members", element: <MembersPage /> }],
  navItems: [
    { label: "Members", to: "/members", order: 1, requiresAuth: true }, 
    { label: "Members", to: "/members", order: 1, requiresAuth: true }, 
    { label: "Members", to: "/members", order: 1, requiresAuth: true }, 
    { label: "Members", to: "/members", order: 1, requiresAuth: true }, 
    { label: "Members", to: "/members", order: 1, requiresAuth: true }
  ],
};
