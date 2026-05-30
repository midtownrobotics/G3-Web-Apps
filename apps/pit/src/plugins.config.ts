import { batteriesPlugin } from "./plugins/batteries";
import { checklistRunnerPlugin } from "./plugins/checklist-runner";
import { checklistsPlugin } from "./plugins/checklists";
import { homePlugin } from "./plugins/home";

export const plugins = [homePlugin, checklistRunnerPlugin, checklistsPlugin, batteriesPlugin];
