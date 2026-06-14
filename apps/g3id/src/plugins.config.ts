import { adminPlugin } from "./plugins/admin";
import { authPlugin } from "./plugins/auth";
import { kioskPlugin } from "./plugins/kiosk";

export const plugins = [authPlugin, adminPlugin, kioskPlugin];
