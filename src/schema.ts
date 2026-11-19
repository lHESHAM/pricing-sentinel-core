import { z } from "zod";

export const SeatBracketSchema = z.object({
  minSeats: z.number().int().nonnegative(),
  maxSeats: z.number().int().positive().nullable(),
  unitPriceUsd: z.number().nonnegative(),
});

export const PricingTierSchema = z.object({
  name: z.string().min(1),
  billingCadence: z.enum(["monthly", "annual", "usage"]),
  currency: z.string().length(3).default("USD"),
  basePrice: z.number().nonnegative().nullable(),
  customEnterprise: z.boolean().default(false),
  seatBrackets: z.array(SeatBracketSchema).default([]),
  features: z.array(z.string().min(1)).min(1),
});

export const PricingSnapshotSchema = z.object({
  domain: z.string().min(3),
  url: z.string().url(),
  capturedAt: z.string().datetime(),
  tiers: z.array(PricingTierSchema).min(1),
});

export type PricingSnapshot = z.infer<typeof PricingSnapshotSchema>;

const CHALLENGE_MARKERS = [
  "cf-browser-verification",
  "challenges.cloudflare.com",
  "dd_cookie_test",
  "geo.captcha-delivery.com",
];

export function isChallengeDom(html: string, status: number): boolean {
  if (status === 403 || status === 429) return true;
  const lower = html.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker));
}

export function shouldTriggerSanityGate(
  previous: PricingSnapshot,
  next: PricingSnapshot,
  maxDriftRatio = 0.4
): { blocked: boolean; driftRatio: number } {
  const prevByName = new Map(
    previous.tiers.map((t) => [t.name.toLowerCase(), t])
  );
  const totalChecks = Math.max(previous.tiers.length, next.tiers.length) * 2;
  let changed = 0;

  for (const tier of next.tiers) {
    const old = prevByName.get(tier.name.toLowerCase());
    if (!old) {
      changed += 2;
      continue;
    }
    if (old.basePrice !== tier.basePrice) changed += 1;
    if (old.features.join("|") !== tier.features.join("|")) changed += 1;
  }

  const driftRatio = totalChecks === 0 ? 0 : changed / totalChecks;
  return { blocked: driftRatio > maxDriftRatio, driftRatio };
}
