export class EndReachedGate {
  private firedVersion = '';
  private retryRequested = false;

  shouldFire(version: string, enabled: boolean): boolean {
    if (!enabled) return false;
    if (this.retryRequested) {
      this.retryRequested = false;
      this.firedVersion = version;
      return true;
    }
    if (this.firedVersion === version) return false;
    this.firedVersion = version;
    return true;
  }

  retry(): void {
    this.retryRequested = true;
  }

  reset(): void {
    this.firedVersion = '';
    this.retryRequested = false;
  }
}
