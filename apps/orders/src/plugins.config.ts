import { budgetPlugin } from "./plugins/budget";
import { catalogPlugin } from "./plugins/catalog";
import { orderingPlugin } from "./plugins/ordering";
import { receivingPlugin } from "./plugins/receiving";
import { requestsPlugin } from "./plugins/requests";
import { settingsPlugin } from "./plugins/settings";
import { vendorsPlugin } from "./plugins/vendors";

export const plugins = [
  catalogPlugin,
  requestsPlugin,
  orderingPlugin,
  receivingPlugin,
  vendorsPlugin,
  budgetPlugin,
  settingsPlugin,
];
