export class TtlSet {
  private readonly ttlMs: number;
  private readonly map = new Map<string, number>();

  constructor(ttlMs: number) {
    this.ttlMs = Math.max(1, ttlMs);
  }

  has(key: string): boolean {
    this.gc(key);
    return this.map.has(key);
  }

  add(key: string): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.map.set(key, expiresAt);
  }

  private gc(key: string): void {
    const exp = this.map.get(key);
    if (exp === undefined) return;
    if (exp <= Date.now()) this.map.delete(key);
  }
}

