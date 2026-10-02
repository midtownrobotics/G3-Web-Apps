import type { InferResponseType } from "hono/client";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../../shared/api";
import { dateInputToMs, formatCents, parseDollars } from "../../shared/format";
import { PRIORITY, PRIORITY_ORDER } from "../../shared/priority";
import type { Priority } from "../../shared/types";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Loading,
  Page,
  SuccessBanner,
  inputClass,
} from "../../shared/ui";
import { useLoad } from "../../shared/use-load";

type Lookup = InferResponseType<typeof api.lookup.$get, 200>;

type Form = {
  url: string;
  vendor: string;
  title: string;
  sku: string;
  variant: string;
  image: string;
  unitPrice: string;
  currency: string;
  quantity: string;
  categoryId: string;
  reason: string;
  priority: Priority;
  needBy: string;
};

const EMPTY: Form = {
  url: "",
  vendor: "",
  title: "",
  sku: "",
  variant: "",
  image: "",
  unitPrice: "",
  currency: "USD",
  quantity: "1",
  categoryId: "",
  reason: "",
  priority: "normal",
  needBy: "",
};

const dollars = (price: number | undefined) => (price === undefined ? "" : price.toFixed(2));

/** Paste a product link; the lookup fills in the details, the requester adds quantity and why. */
export function NewRequestPage() {
  const categories = useLoad(async () => {
    const res = await api.categories.$get({ query: {} });
    if (!res.ok) throw new Error(await getErrorMessage(res));
    return (await res.json()).filter((c) => !c.isArchived);
  }, []);

  const [link, setLink] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function runLookup(e: FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    setSubmitted(null);
    try {
      const res = await api.lookup.$get({ query: { url: link.trim() } });
      if (!res.ok) throw new Error(await getErrorMessage(res));
      const result = await res.json();
      const selected = result.variants.find((v) => v.id === result.selectedVariantId);
      setLookup(result);
      setForm({
        ...EMPTY,
        categoryId: form?.categoryId ?? "",
        url: result.url,
        vendor: result.vendor,
        title: result.title,
        sku: result.sku ?? "",
        variant: result.variants.length > 1 ? (selected?.title ?? "") : "",
        image: result.image ?? "",
        unitPrice: dollars(result.price),
        currency: result.currency ?? "USD",
      });
    } catch (err) {
      setLookup(null);
      setError(
        `${err instanceof Error ? err.message : String(err)} You can still fill in the details by hand.`,
      );
      setForm({ ...(form ?? EMPTY), url: link.trim() });
    } finally {
      setBusy(false);
    }
  }

  function pickVariant(id: string) {
    const v = lookup?.variants.find((x) => x.id === id);
    if (!v) return;
    set({
      variant: v.title,
      sku: v.sku ?? form?.sku ?? "",
      unitPrice: dollars(v.price) || form?.unitPrice,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const unitPriceCents = parseDollars(form.unitPrice);
    if (Number.isNaN(unitPriceCents)) return setError("Price must be a dollar amount like 12.50.");
    const quantity = Number(form.quantity);
    if (!form.categoryId) return setError("Pick a budget category.");
    setBusy(true);
    setError(null);
    try {
      const res = await api.requests.$post({
        json: {
          url: form.url,
          vendor: form.vendor,
          title: form.title,
          sku: form.sku || null,
          variant: form.variant || null,
          image: form.image || null,
          unitPriceCents,
          currency: form.currency,
          quantity,
          categoryId: Number(form.categoryId),
          reason: form.reason,
          priority: form.priority,
          needBy: dateInputToMs(form.needBy),
        },
      });
      if (!res.ok) throw new Error(await getErrorMessage(res));
      // Back to an empty form for the next request.
      setSubmitted(`Your request for ${quantity}× ${form.title} was submitted for review.`);
      setForm(null);
      setLookup(null);
      setLink("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const unitCents = form ? parseDollars(form.unitPrice) : null;
  const total =
    unitCents !== null && !Number.isNaN(unitCents) && Number(form?.quantity) > 0
      ? unitCents * Number(form?.quantity)
      : null;

  return (
    <Page title="New Request">
      <form onSubmit={runLookup} className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste a product link (WCP, REV, AndyMark, Amazon, McMaster, …)"
          className={inputClass}
          required
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy && !form ? "Looking up…" : "Look up"}
        </Button>
      </form>
      {!form && (
        <button
          type="button"
          onClick={() => {
            setSubmitted(null);
            setForm({ ...EMPTY, url: link.trim() });
          }}
          className="text-sm text-secondary-500 hover:text-secondary-800 underline"
        >
          Enter details by hand instead
        </button>
      )}

      {submitted && <SuccessBanner message={submitted} />}
      {error && <ErrorBanner message={error} />}

      {form && (
        <form onSubmit={submit}>
          <Card>
            <div className="flex flex-col md:flex-row gap-6">
              {form.image && (
                <img
                  src={form.image}
                  alt=""
                  className="w-full md:w-44 h-44 object-contain rounded-lg bg-secondary-50 shrink-0"
                />
              )}
              <div className="flex-1 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Field label="Item">
                    <input
                      className={inputClass}
                      value={form.title}
                      onChange={(e) => set({ title: e.target.value })}
                      required
                      maxLength={300}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Link">
                    <input
                      type="url"
                      className={inputClass}
                      value={form.url}
                      onChange={(e) => set({ url: e.target.value })}
                      required
                    />
                  </Field>
                </div>
                {lookup && lookup.variants.length > 1 && (
                  <div className="sm:col-span-2">
                    <Field label="Option">
                      <select
                        className={inputClass}
                        value={lookup.variants.find((v) => v.title === form.variant)?.id ?? ""}
                        onChange={(e) => pickVariant(e.target.value)}
                        required
                      >
                        <option value="" disabled>
                          Pick one…
                        </option>
                        {lookup.variants.map((v) => (
                          <option key={v.id} value={v.id} disabled={v.available === false}>
                            {v.title}
                            {v.price !== undefined
                              ? ` — ${formatCents(Math.round(v.price * 100), form.currency)}`
                              : ""}
                            {v.available === false ? " (out of stock)" : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <Field label="Vendor">
                  <input
                    className={inputClass}
                    value={form.vendor}
                    onChange={(e) => set({ vendor: e.target.value })}
                    placeholder="From the link if blank"
                  />
                </Field>
                <Field label="SKU / part number">
                  <input
                    className={inputClass}
                    value={form.sku}
                    onChange={(e) => set({ sku: e.target.value })}
                  />
                </Field>
                <Field
                  label="Price each"
                  hint={
                    lookup?.priceUnit ? `Per ${lookup.priceUnit}` : "Leave blank if you don't know"
                  }
                >
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={form.unitPrice}
                    onChange={(e) => set({ unitPrice: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
                <Field
                  label="Quantity"
                  hint={
                    total !== null
                      ? `Estimated total ${formatCents(total, form.currency)}`
                      : undefined
                  }
                >
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    className={inputClass}
                    value={form.quantity}
                    onChange={(e) => set({ quantity: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Priority" hint={PRIORITY[form.priority].hint || undefined}>
                  <select
                    className={inputClass}
                    value={form.priority}
                    onChange={(e) => set({ priority: e.target.value as Priority })}
                  >
                    {PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY[p].label}
                        {PRIORITY[p].hint ? ` — ${PRIORITY[p].hint.toLowerCase()}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Need by (optional)">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.needBy}
                    onChange={(e) => set({ needBy: e.target.value })}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Budget category">
                    {categories.data ? (
                      categories.data.length === 0 ? (
                        <p className="text-sm text-secondary-500">
                          No budget categories yet. A mentor needs to add one on the{" "}
                          <Link to="/budget" className="underline">
                            Budget
                          </Link>{" "}
                          page.
                        </p>
                      ) : (
                        <select
                          className={inputClass}
                          value={form.categoryId}
                          onChange={(e) => set({ categoryId: e.target.value })}
                          required
                        >
                          <option value="" disabled>
                            Pick one…
                          </option>
                          {categories.data.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )
                    ) : categories.error ? (
                      <ErrorBanner message={categories.error} />
                    ) : (
                      <Loading />
                    )}
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Why do we need it?">
                    <textarea
                      className={`${inputClass} min-h-24`}
                      value={form.reason}
                      onChange={(e) => set({ reason: e.target.value })}
                      required
                      maxLength={1000}
                      placeholder="What it's for, and anything a mentor should know"
                    />
                  </Field>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-secondary-500">
                You'll get a Slack DM when a mentor approves it.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </Page>
  );
}
