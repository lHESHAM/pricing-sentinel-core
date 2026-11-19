import { test, expect } from "@playwright/test";
import { PricingSnapshotSchema } from "../src/schema";
import {
  canOpenSelfHealPr,
  DomainCircuitBreaker,
} from "../src/domain-lock";

test.describe("Shadow DOM modals, seat sliders, and PR domain locks", () => {
  test("pierces shadow DOM modal, adjusts seat slider and currency switcher", async ({
    page,
  }) => {
    await page.setContent(`
      <pricing-modal></pricing-modal>
      <script>
        class PricingModal extends HTMLElement {
          constructor() {
            super();
            const shadow = this.attachShadow({ mode: "open" });
            shadow.innerHTML = \`
              <section aria-label="Growth plan">
                <h2>Growth</h2>
                <label>
                  Currency
                  <select aria-label="Currency">
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label>
                  Seats
                  <input type="range" aria-label="Seat count" min="5" max="100" step="5" value="5" />
                </label>
                <p id="unit-price">25</p>
                <ul>
                  <li>Usage-based billing</li>
                  <li>Priority support</li>
                </ul>
              </section>
            \`;
            const select = shadow.querySelector("select");
            const slider = shadow.querySelector("input");
            const price = shadow.querySelector("#unit-price");

            const recalc = () => {
              const seats = Number(slider.value);
              const base = seats >= 25 ? 20 : 25;
              const adjusted = select.value === "EUR" ? base - 2 : base;
              price.textContent = String(adjusted);
            };
            select.addEventListener("change", recalc);
            slider.addEventListener("input", recalc);
            slider.addEventListener("change", recalc);
          }
        }
        customElements.define("pricing-modal", PricingModal);
      </script>
    `);

    await page.getByLabel("Currency").selectOption("EUR");
    await page.getByLabel("Seat count").fill("25");

    const card = page.getByRole("region", { name: /growth plan/i });
    const name = await card.getByRole("heading").innerText();
    const unitPrice = Number(await page.locator("#unit-price").innerText());
    const features = await card.getByRole("listitem").allInnerTexts();

    const parsed = PricingSnapshotSchema.parse({
      domain: "usage-saas.io",
      url: "https://usage-saas.io/pricing",
      capturedAt: new Date().toISOString(),
      tiers: [
        {
          name,
          billingCadence: "usage",
          currency: "EUR",
          basePrice: unitPrice * 25,
          customEnterprise: false,
          seatBrackets: [{ minSeats: 25, maxSeats: 100, unitPriceUsd: unitPrice }],
          features,
        },
      ],
    });

    expect(parsed.tiers[0].currency).toBe("EUR");
    expect(parsed.tiers[0].basePrice).toBe(450);
  });

  test("enforces max 1 open self-heal PR per target domain", () => {
    const openPrs = [
      {
        number: 42,
        headRef: "devin/fix/acme-com-parser",
        labels: ["self-heal", "domain:acme.com"],
      },
    ];

    expect(canOpenSelfHealPr("acme.com", openPrs)).toEqual({
      allowed: false,
      blockingPr: 42,
    });
    expect(canOpenSelfHealPr("other-saas.io", openPrs)).toEqual({
      allowed: true,
    });
  });

  test("marks target rate-limited after 3 consecutive captcha failures", () => {
    const breaker = new DomainCircuitBreaker(3);

    expect(breaker.recordFailure("cloudflare-target.com").rateLimited).toBe(false);
    expect(breaker.recordFailure("cloudflare-target.com").rateLimited).toBe(false);
    expect(breaker.recordFailure("cloudflare-target.com").rateLimited).toBe(true);
    expect(breaker.isRateLimited("cloudflare-target.com")).toBe(true);

    breaker.recordSuccess("cloudflare-target.com");
    expect(breaker.isRateLimited("cloudflare-target.com")).toBe(false);
  });
});
