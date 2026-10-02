import { budgetPlugin } from "./plugins/budget";
import { orderingPlugin } from "./plugins/ordering";
import { requestsPlugin } from "./plugins/requests";
import { vendorsPlugin } from "./plugins/vendors";

export const plugins = [requestsPlugin, orderingPlugin, vendorsPlugin, budgetPlugin];
