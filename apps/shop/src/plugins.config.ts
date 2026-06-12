import { adminPlugin } from "./plugins/admin";
import { boardPlugin } from "./plugins/board";
import { homePlugin } from "./plugins/home";
import { partsPlugin } from "./plugins/parts";

export const plugins = [homePlugin, partsPlugin, boardPlugin, adminPlugin];
