import { test, expect } from "@playwright/test";
import {
  PricingSnapshotSchema,
  isChallengeDom,
  shouldTriggerSanityGate,
  type PricingSnapshot,
} from "../src/schema";

test.describe("SaaS pricing extractor guardrails", () => {
  test("toggles annual billing, extracts via ARIA roles, and passes Zod validation", async ({
    page,
  }) => {
    await page.setContent(`
      <main>
        <button
          role="switch"
          aria-label="Annual billing"
          aria-checked="false"
          onclick="const on = this.getAttribute('aria-checked') === 'true'; this.setAttribute('aria-checked', String(!on)); document.getElementById('pro-price').textContent = on ? '$49/mo' : '$39/mo';"
        >
          Annual billing
        </button>
        <section aria-label="Pro plan">
          <h2>Pro</h2>
          <p id="pro-price">$49/mo</p>
          <ul>
            <li>Unlimited projects</li>
            <li>SSO & Audit Logs</li>
          </ul>
        </section>
      </main>
    `);

    const billingToggle = page.getByRole("switch", { name: /annual billing/i });
    await billingToggle.click();
    await expect(billingToggle).toHaveAttribute("aria-checked", "true");

    const proCard = page.getByRole("region", { name: /pro plan/i });
    const name = await proCard.getByRole("heading").innerText();
    const rawPrice = await proCard.getByText(/\$\d+/).innerText();
    const features = await proCard.getByRole("listitem").allInnerTexts();

    const parsed = PricingSnapshotSchema.parse({
      domain: "example-saas.com",
      url: "https://example-saas.com/pricing",
      capturedAt: new Date().toISOString(),
      tiers: [
        {
          name,
          billingCadence: "annual",
          currency: "USD",
          basePrice: Number(rawPrice.replace(/[^0-9.]/g, "")),
          customEnterprise: false,
          seatBrackets: [],
          features,
        },
      ],
    });

    expect(parsed.tiers[0].basePrice).toBe(39);
    expect(parsed.tiers[0].billingCadence).toBe("annual");
  });

  test("aborts before parser on Cloudflare or DataDome challenge", () => {
    const html = `<div id="cf-browser-verification">Checking your browser</div>`;
    expect(isChallengeDom(html, 200)).toBe(true);
    expect(isChallengeDom("<html><body>Pricing</body></html>", 403)).toBe(true);
  });

  test("pauses alerts when >40% of canonical fields drift on a redesign", () => {
    const prev: PricingSnapshot = {
      domain: "example-saas.com",
      url: "https://example-saas.com/pricing",
      capturedAt: "2026-11-18T00:00:00.000Z",
      tiers: [
        {
          name: "Starter",
          billingCadence: "monthly",
          currency: "USD",
          basePrice: 29,
          customEnterprise: false,
          seatBrackets: [],
          features: ["5 seats"],
        },
      ],
    };

    const next: PricingSnapshot = {
      ...prev,
      capturedAt: "2026-11-19T00:00:00.000Z",
      tiers: [
        {
          name: "Growth",
          billingCadence: "monthly",
          currency: "USD",
          basePrice: 99,
          customEnterprise: false,
          seatBrackets: [],
          features: ["Unlimited seats"],
        },
      ],
    };

    const gate = shouldTriggerSanityGate(prev, next);
    expect(gate.blocked).toBe(true);
    expect(gate.driftRatio).toBeGreaterThan(0.4);
  });
});
