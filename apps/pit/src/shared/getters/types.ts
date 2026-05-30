export type ChecklistList = {
  id: number;
  name: string;
  description: string | null;
  createdAt: number;
  itemCount: number;
};

export type ChecklistItem = {
  id: number;
  listId: number;
  index: number;
  type: "item" | "topic";
  name: string;
  description: string | null;
  createdAt: number;
};
