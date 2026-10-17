// One complete snapshot per process. Never serve expired data after a failed refresh.
export class SingleFlightCache<T> {
  private value?: { data: T; expires: number };
  private pending?: Promise<T>;
  constructor(private ttlMs: number, private now = Date.now) {}
  async get(load: () => Promise<T>): Promise<T> {
    if (this.value && this.value.expires > this.now()) return this.value.data;
    if (this.pending) return this.pending;
    this.pending = load().then(data => {
      this.value = { data, expires: this.now() + this.ttlMs }; return data;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
