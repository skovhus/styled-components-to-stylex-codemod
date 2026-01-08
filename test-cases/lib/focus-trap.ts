// Mock focus-trap module for testing

export interface FocusTrap {
  activate(): void;
  deactivate(): void;
}

export function createFocusTrap(element: HTMLElement): FocusTrap {
  return {
    activate() {},
    deactivate() {},
  };
}
