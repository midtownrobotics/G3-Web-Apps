import { PartDetailPage } from "./part-detail-page";

export const partDetailPlugin = {
  routes: [
    {
      path: "/part",
      element: <PartDetailPage />,
    },
  ],
  navItems: [],
};
