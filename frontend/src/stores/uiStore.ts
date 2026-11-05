import { create } from "zustand";

// Client-only UI state that has nothing to do with server data.
// Products/orders/investments/transactions stay on React Query's cache —
// this store is only for things like "is the dashboard sidebar collapsed",
// never for anything fetched from the backend.
type UIState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
