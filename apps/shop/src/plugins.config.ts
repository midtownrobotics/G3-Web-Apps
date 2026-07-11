import { adminPlugin } from "./plugins/admin";
import { boardPlugin } from "./plugins/board";
import { drawingsPlugin } from "./plugins/drawings";
import { homePlugin } from "./plugins/home";
import { partsPlugin } from "./plugins/parts";

export const plugins = [homePlugin, partsPlugin, boardPlugin, adminPlugin, drawingsPlugin];
