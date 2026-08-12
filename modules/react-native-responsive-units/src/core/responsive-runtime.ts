export type ResponsiveRuntime = Readonly<{
  designWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}>;

let activeRuntime: ResponsiveRuntime | undefined;

function assertFinite(value: number, parameterName: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${parameterName} must be a finite number.`);
  }
}

export function createResponsiveRuntime(
  designWidth: number,
  viewportWidth: number,
  viewportHeight: number,
): ResponsiveRuntime {
  assertFinite(designWidth, 'designWidth');
  if (designWidth <= 0) {
    throw new RangeError('designWidth must be greater than 0.');
  }

  assertFinite(viewportWidth, 'viewportWidth');
  assertFinite(viewportHeight, 'viewportHeight');
  if (viewportWidth < 0 || viewportHeight < 0) {
    throw new RangeError('viewportWidth and viewportHeight cannot be negative.');
  }

  return { designWidth, viewportHeight, viewportWidth };
}

export function activateResponsiveRuntime(runtime: ResponsiveRuntime): void {
  activeRuntime = runtime;
}

export function deactivateResponsiveRuntime(runtime: ResponsiveRuntime): void {
  if (activeRuntime === runtime) {
    activeRuntime = undefined;
  }
}

export function getResponsiveRuntime(): ResponsiveRuntime {
  if (activeRuntime === undefined) {
    throw new Error(
      'Responsive units require a mounted ResponsiveProvider before use.',
    );
  }

  return activeRuntime;
}

export function assertResponsiveValue(
  value: number,
  parameterName: string,
): number {
  assertFinite(value, parameterName);
  return value;
}
