export type BatteryState = "Charging" | "In Robot" | "Idle" | "Broken" | "Next Up";

export type Battery = {
  id: number;
  name: string;
  state: BatteryState;
  stateSince: number; // ms timestamp
  voltage: number | null;
  createdAt: number;
};

export type ChecklistList = {
  id: number;
  name: string;
  description: string | null;
  createdAt: number;
  itemCount: number;
  checkedCount: number;
};

export type ChecklistItem = {
  id: number;
  listId: number;
  index: number;
  type: "item" | "topic";
  name: string;
  description: string | null;
  checked: boolean;
  createdAt: number;
};

export type ChecklistIssue = {
  id: number;
  itemId: number;
  text: string;
  createdAt: number;
};

export type ChecklistIssueSummary = ChecklistIssue & {
  itemName: string;
  listId: number;
  listName: string;
};
