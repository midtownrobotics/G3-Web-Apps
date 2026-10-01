import { boxPlugin } from "./plugins/box";
import { drivePlugin } from "./plugins/drive";
import { networkPlugin } from "./plugins/network";
import { printPlugin } from "./plugins/print";

export const plugins = [networkPlugin, printPlugin, drivePlugin, boxPlugin];
