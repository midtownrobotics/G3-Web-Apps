import { fetchItems } from "./getters/items";
import { fetchLists } from "./getters/lists";

export async function prefetchAll(): Promise<void> {
  const lists = await fetchLists();
  await Promise.all(lists.map((list) => fetchItems(list.id)));
}
