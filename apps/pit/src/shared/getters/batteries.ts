import { api } from "../api";
import type { Battery } from "./types";

export async function fetchBatteries(): Promise<Battery[]> {
  const res = await api.batteries.$get();
  if (!res.ok) throw new Error(`Failed to fetch batteries (${res.status})`);
  return res.json() as Promise<Battery[]>;
}
