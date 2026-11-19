export interface OpenPullRequest {
  number: number;
  headRef: string;
  labels: string[];
}

export function canOpenSelfHealPr(
  domain: string,
  openPrs: OpenPullRequest[]
): { allowed: boolean; blockingPr?: number } {
  const slug = domain.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = openPrs.find(
    (pr) =>
      pr.headRef.toLowerCase().includes(`fix/${slug}`) ||
      pr.labels.some((l) => l.toLowerCase() === `domain:${domain.toLowerCase()}`)
  );

  if (existing) {
    return { allowed: false, blockingPr: existing.number };
  }
  return { allowed: true };
}

export class DomainCircuitBreaker {
  private failures = new Map<string, number>();

  constructor(private readonly maxConsecutiveFailures = 3) {}

  recordFailure(domain: string): { rateLimited: boolean; count: number } {
    const key = domain.toLowerCase();
    const count = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, count);
    return {
      rateLimited: count >= this.maxConsecutiveFailures,
      count,
    };
  }

  recordSuccess(domain: string): void {
    this.failures.delete(domain.toLowerCase());
  }

  isRateLimited(domain: string): boolean {
    return (
      (this.failures.get(domain.toLowerCase()) ?? 0) >=
      this.maxConsecutiveFailures
    );
  }
}
