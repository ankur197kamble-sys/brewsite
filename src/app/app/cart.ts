import type { AppMenuItem, AppMenuSection } from "./data";
import type { Cart } from "./storage";

export type CartLine = { item: AppMenuItem; quantity: number };

/**
 * The cart priced against the current menu. Dishes no longer on the menu
 * are dropped, so the customer never sees a line the server would refuse.
 * The total shown here is a preview; the server prices the real order.
 */
export function cartSummary(cart: Cart, menu: AppMenuSection[]) {
  const items = new Map(menu.flatMap((section) => section.items).map((item) => [String(item.id), item]));
  const lines: CartLine[] = [];
  for (const [id, quantity] of Object.entries(cart)) {
    const item = items.get(id);
    if (item) lines.push({ item, quantity });
  }
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalPaise: lines.reduce((sum, line) => sum + line.item.pricePaise * line.quantity, 0),
  };
}
