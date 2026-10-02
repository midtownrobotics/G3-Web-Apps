import { afterEach, describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { lookupPart, meterLookups } from "./part-lookup";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  meterLookups(null);
});

/** Serves `html` for every request, like a single product page. */
function servePage(html: string) {
  globalThis.fetch = (async () =>
    new Response(html, { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
}

const price = (cls: string, text: string) =>
  `<span class="a-price ${cls}"><span class="a-offscreen">${text}</span><span aria-hidden="true"><span class="a-price-whole">${text.replace(/^\$|\.\d+$/g, "")}<span class="a-price-decimal">.</span></span><span class="a-price-fraction">${text.split(".")[1] ?? ""}</span></span></span>`;

// Same order as the real page: the buy-box accordion comes before the desktop price block.
const amazonPage = (desktop: string, accordion: string) => `<html><body>
  <span id="productTitle"> Duck Brand Max Strength Duct Tape - 2 Rolls </span>
  <div id="corePrice_feature_div">${accordion}</div>
  <div id="corePriceDisplay_desktop_feature_div">${desktop}</div>
</body></html>`;

describe("amazon price", () => {
  test("takes the price to pay, not the per-unit or list price", async () => {
    // As on B09WJWTW6J: the desktop price-to-pay is empty, then "$0.05 / foot" and a $19.98 list price.
    servePage(
      amazonPage(
        `${price("priceToPay", " ")}${price("a-text-price apex-priceperunit-value", "$0.05")}${price("a-text-price apex-basisprice-value", "$19.98")}`,
        `${price("apex-pricetopay-value", "$13.58")}${price("a-text-price apex-priceperunit-value", "$0.05")}`,
      ),
    );
    const result = await lookupPart("https://www.amazon.com/dp/B09WJWTW6J?th=1");
    expect(result.price).toBe(13.58);
    expect(result.title).toBe("Duck Brand Max Strength Duct Tape - 2 Rolls");
  });

  test("ignores per-unit prices when they come first", async () => {
    servePage(
      amazonPage(
        `${price("a-text-price apex-priceperunit-value", "$0.09")}${price("priceToPay", "$48.97")}`,
        "",
      ),
    );
    expect((await lookupPart("https://www.amazon.com/dp/B000000000")).price).toBe(48.97);
  });
});

describe("data metering", () => {
  test("counts compressed bytes on the wire and still parses the page", async () => {
    const page = amazonPage("", price("apex-pricetopay-value", "$13.58")) + " ".repeat(50_000);
    const gz = gzipSync(page);
    let requested: RequestInit | undefined;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      requested = init;
      return new Response(gz, {
        headers: { "content-type": "text/html", "content-encoding": "gzip" },
      });
    }) as unknown as typeof fetch;
    const usage = { dl: 0, ul: 0 };
    meterLookups((dl, ul) => {
      usage.dl += dl;
      usage.ul += ul;
    });

    const result = await lookupPart("https://www.amazon.com/dp/B09WJWTW6J");
    expect(result.price).toBe(13.58);
    expect((requested as { decompress?: boolean }).decompress).toBe(false);
    // Compressed body plus headers: far below the 50 KB+ the page is once decompressed.
    expect(usage.dl).toBeGreaterThan(gz.length);
    expect(usage.dl).toBeLessThan(gz.length + 500);
    expect(usage.ul).toBeGreaterThan(50);
  });
});
