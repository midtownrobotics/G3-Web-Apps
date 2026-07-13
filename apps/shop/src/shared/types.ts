export type Subsystem = {
  id: number;
  name: string;
  createdAt: number;
};

export type Process = {
  id: number;
  name: string;
  createdAt: number;
};

export type PartDefinition = {
  id: number;
  onshapePartNumber: string;
  revision: string;
  subsystemId: number;
  creator: string;
  name: string;
  notes: string | null;
  partDrawingUrl: string | null;
  createdAt: number;
};

export type PartInstance = {
  id: number;
  partDefinitionId: number;
  instanceNumber: number;
  isPriority: number;
  isStale: number;
  createdAt: number;
};

export type Blueprint = {
  id: number;
  partDefinitionId: number;
  processId: number;
  index: number;
  createdAt: number;
};

export type ProcessStatus = "waiting" | "todo" | "doing" | "done";

export type ActionType = "started" | "completed";

export type Action = {
  id: number;
  userId: string;
  partInstanceId: number;
  processId: number;
  action: ActionType;
  createdAt: number;
};

export type KioskPresence = {
  id: number;
  kioskDeviceId: number;
  deviceName: string;
  userId: string;
  updatedAt: number;
};

export type PartInstanceProcess = {
  id: number;
  partInstanceId: number;
  processId: number;
  index: number;
  status: ProcessStatus;
  completedAt: number | null;
  createdAt: number;
};
