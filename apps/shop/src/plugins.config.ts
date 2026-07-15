import { adminPlugin } from "./plugins/admin";
import { boardPlugin } from "./plugins/board";
import { bomPlugin } from "./plugins/bom";
import { homePlugin } from "./plugins/home";
import { leaderboardPlugin } from "./plugins/leaderboard";
import { partsPlugin } from "./plugins/parts";
import { partViewerPlugin } from "./plugins/part-viewer";

export const plugins = [
  homePlugin,
  partsPlugin,
  boardPlugin,
  adminPlugin,
  leaderboardPlugin,
  bomPlugin,
  partViewerPlugin,
];
