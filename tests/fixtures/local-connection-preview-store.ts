export const useWorkstationLayoutStore = (selector: (store: unknown) => unknown) => selector({
  openPanelInActiveGroup: (panel: string) => (window as any).__connectionPreviewOpenPanel(panel),
});
