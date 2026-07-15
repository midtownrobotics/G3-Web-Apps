import { adminPlugin } from "./plugins/admin";
import { boardPlugin } from "./plugins/board";
import { bomPlugin } from "./plugins/bom";
import { homePlugin } from "./plugins/home";
import { leaderboardPlugin } from "./plugins/leaderboard";
import { partViewerPlugin } from "./plugins/part-viewer";
import { partsPlugin } from "./plugins/parts";

export const plugins = [
  homePlugin,
  partsPlugin,
  boardPlugin,
  adminPlugin,
  leaderboardPlugin,
  bomPlugin,
  partViewerPlugin,
];
