import { create } from "zustand";

// Client-only, session-scoped queue of products an investor wants to fund
// before paying once for the whole batch. Deliberately not persisted
// server-side (unlike the customer cart) — building an invest selection is a
// quick, one-sitting action, so it's fine if a refresh clears it.
export type InvestorCartItem = {
  productId: string;
  name: string;
  img?: string;
  investorPrice: number;
  quantity: number;
  maxQuantity: number;
};

type InvestorCartState = {
  items: InvestorCartItem[];
  addItem: (item: Omit<InvestorCartItem, "quantity">, quantity: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
};

export const useInvestorCartStore = create<InvestorCartState>((set) => ({
  items: [],
  addItem: (item, quantity) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      const clampedQuantity = Math.min(quantity, item.maxQuantity);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: Math.min(i.quantity + quantity, i.maxQuantity) }
              : i
          ),
        };
      }
      return { items: [...state.items, { ...item, quantity: clampedQuantity }] };
    }),
  setQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.productId === productId
          ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxQuantity)) }
          : i
      ),
    })),
  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
  clear: () => set({ items: [] }),
}));
