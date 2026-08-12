let windowDimensions = { height: 800, width: 375 };

export function setWindowDimensions(width: number, height: number): void {
  windowDimensions = { height, width };
}

export function useWindowDimensions(): typeof windowDimensions {
  return windowDimensions;
}
