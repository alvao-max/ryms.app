"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { aiConsentAction, boughtAction, evaluateAction, moveBudgetAction, plannedCandidatesAction, saveLaterAction, skipAction, switchDemoAction, type CheckResponse } from "@/app/actions";
import { lower } from "@/lib/i18n";
import { formatKr, oreToInput, parseKr } from "@/lib/money";
import type { Suggestion } from "@/lib/services/analyze";
import { CameraIcon, CheckIcon, CloseIcon, ImageIcon, InfoIcon, PenIcon, ShieldIcon } from "./icons";
import { Landscape } from "./Landscape";
import { useLocale, useT } from "./Locale";
import { Sheet } from "./Sheet";

type Step = "start" | "analyzing" | "confirm" | "result" | "done";
interface Cat {
  id: string;
  name: string;
}
interface Candidate {
  id: string;
  name: string;
  maxOre: number;
  categoryId: string;
  likely: boolean;
}
export interface FlowProps {
  categories: Cat[];
  aiAvailable: boolean;
  aiConsent: boolean;
  demo: boolean;
  samples: { key: string; title: string; file: string }[];
  initial?: { checkId?: string | null; itemName?: string; priceOre?: number | null; categoryId?: string | null; plannedPurchaseId?: string | null; imageId?: string | null; auto?: boolean };
}

async function shrink(file: File): Promise<Blob> {
  // Mindre bild = snabbare svar i butiken. Faller tillbaka på originalet om webbläsaren inte kan.
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function RymsDetFlow({ categories, aiAvailable, aiConsent, demo, samples, initial }: FlowProps) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [step, setStep] = useState<Step>(initial?.itemName ? "confirm" : "start");
  const [itemName, setItemName] = useState(initial?.itemName ?? "");
  const [price, setPrice] = useState(initial?.priceOre ? oreToInput(initial.priceOre) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [plannedId, setPlannedId] = useState<string | null>(initial?.plannedPurchaseId ?? null);
  const [plannedAnswered, setPlannedAnswered] = useState(!!initial?.plannedPurchaseId);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(initial?.imageId ? `/api/images/${initial.imageId}` : null);
  const [source, setSource] = useState<"photo" | "screenshot" | "manual">("manual");
  const [consented, setConsented] = useState(aiConsent);
  const [pendingFile, setPendingFile] = useState<{ file: File; source: "photo" | "screenshot" } | null>(null);
  const [response, setResponse] = useState<CheckResponse | null>(null);
  const [sheet, setSheet] = useState<null | "bought" | "save" | "move">(null);
  const [keepImage, setKeepImage] = useState(false);
  const [done, setDone] = useState<{ title: string; text: string } | null>(null);
  const [busy, start] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  useEffect(() => () => void (preview?.startsWith("blob:") && URL.revokeObjectURL(preview)), [preview]);

  const priceOre = parseKr(price);
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const request = { itemName, priceOre: priceOre ?? 0, categoryId: categoryId || null, plannedPurchaseId: plannedId };

  // Kan det här vara ett köp du redan planerat? Frågan ställs, svaret är alltid ditt.
  const lookupPlanned = useCallback((name: string, cat: string) => {
    if (!name.trim()) return setCandidates([]);
    plannedCandidatesAction(name, cat || null).then((c) => setCandidates(c));
  }, []);
  useEffect(() => {
    if (step !== "confirm") return;
    const t = setTimeout(() => lookupPlanned(itemName, categoryId), 350);
    return () => clearTimeout(t);
  }, [step, itemName, categoryId, lookupPlanned]);

  const likely = candidates.find((c) => c.likely) ?? null;
  const askPlanned = !!likely && !plannedAnswered && !questionOpen;

  function applySuggestion(s: Suggestion) {
    setSuggestion(s);
    setItemName(s.itemName);
    setPrice(s.priceOre ? oreToInput(s.priceOre) : "");
    const cat = categories.find((c) => c.name === s.categoryName);
    setCategoryId(cat?.id ?? "");
    setQuestionOpen(!!s.question);
    setPlannedId(null);
    setPlannedAnswered(false);
    setStep("confirm");
  }

  async function analyze(body: FormData) {
    setStep("analyzing");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body });
      const data = (await res.json()) as { suggestion?: Suggestion; unavailable?: boolean; error?: string };
      if (data.suggestion) return applySuggestion(data.suggestion);
      setNotice(data.error ?? t("Bilden gick inte att analysera just nu. Fyll i själv – uträkningen fungerar som vanligt.", "The image could not be analysed right now. Fill it in yourself – the calculation works as usual."));
    } catch {
      setNotice(t("Ingen kontakt med bildanalysen. Fyll i själv – uträkningen fungerar som vanligt.", "Could not reach the image analysis. Fill it in yourself – the calculation works as usual."));
    }
    setSuggestion(null);
    setQuestionOpen(false);
    setStep("confirm");
  }

  async function sendFile(file: File, src: "photo" | "screenshot") {
    setSource(src);
    setStep("analyzing");
    const blob = await shrink(file);
    setImage(blob);
    setPreview(URL.createObjectURL(blob));
    const fd = new FormData();
    fd.set("image", new File([blob], "bild.jpg", { type: blob.type || file.type }));
    await analyze(fd);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>, src: "photo" | "screenshot") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) return setError(t("Bilden är för stor.", "The image is too large."));
    if (!consented) return setPendingFile({ file, source: src });
    void sendFile(file, src);
  }

  async function pickSample(key: string, file: string) {
    setSource("photo");
    setImage(null);
    setPreview(file);
    const fd = new FormData();
    fd.set("sample", key);
    await analyze(fd);
  }

  const runCheck = useCallback(
    (req = request) => {
      setError(null);
      start(async () => {
        const r = await evaluateAction(req, categories.find((c) => c.id === req.categoryId)?.name ?? null);
        if (r.error) return setError(r.error);
        setResponse(r);
        setStep("result");
        window.scrollTo({ top: 0 });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemName, price, categoryId, plannedId, categories],
  );

  useEffect(() => {
    if (initial?.auto && !autoRan.current && initial.itemName && initial.priceOre) {
      autoRan.current = true;
      runCheck({ itemName: initial.itemName, priceOre: initial.priceOre, categoryId: initial.categoryId ?? null, plannedPurchaseId: initial.plannedPurchaseId ?? null });
    }
  }, [initial, runCheck]);

  function submitConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!itemName.trim()) return setError(t("Skriv vad det är du vill köpa.", "Enter what you want to buy."));
    if (priceOre == null || priceOre === 0) {
      priceRef.current?.focus();
      return setError(t("Ange vad den kostar, till exempel 699.", "Enter the price, for example 699."));
    }
    runCheck();
  }

  const ev = response?.evaluation;
  const tone = ev?.result.verdict === "yes" ? "meadow" : ev?.result.verdict === "caution" ? "dusk" : "ember";

  function confirmBought() {
    start(async () => {
      const r = await boughtAction({ ...request, checkId: initial?.checkId ?? null });
      if (r.error) return setError(r.error);
      setSheet(null);
      setDone({
        title: t("Köpet är registrerat", "Purchase recorded"),
        text: t(
          `${formatKr(request.priceOre)} är avräknat${category ? ` från ${lower(category.name, locale)}` : ""}. När köpet dyker upp från banken räknas det fortfarande bara en gång.`,
          `${formatKr(request.priceOre)} has been deducted${category ? ` from ${lower(category.name, locale)}` : ""}. When the purchase shows up from the bank it is still only counted once.`,
        ),
      });
      setStep("done");
    });
  }
  function confirmSave() {
    start(async () => {
      let imageId: string | null = null;
      if (keepImage && image) {
        const fd = new FormData();
        fd.set("image", new File([image], "bild.jpg", { type: image.type }));
        const res = await fetch("/api/images", { method: "POST", body: fd });
        const data = (await res.json()) as { imageId?: string; error?: string };
        if (!data.imageId) return setError(data.error ?? t("Bilden kunde inte sparas.", "The image could not be saved."));
        imageId = data.imageId;
      }
      const r = await saveLaterAction({ ...request, checkId: initial?.checkId ?? null, imageId, source });
      if (r.error) return setError(r.error);
      setSheet(null);
      setDone({
        title: t("Sparad till senare", "Saved for later"),
        text: t(
          `Budgeten är oförändrad. Du hittar den under Sparat och kan kolla igen när du vill – då räknar Ryms mot budgeten som den ser ut då.${keepImage && image ? "" : image ? " Bilden sparades inte." : ""}`,
          `Your budget is unchanged. You will find it under Saved and can check again whenever you like – Ryms then calculates against your budget as it looks at that point.${keepImage && image ? "" : image ? " The image was not saved." : ""}`,
        ),
      });
      setStep("done");
    });
  }
  function doSkip() {
    start(async () => {
      await skipAction(initial?.checkId ?? null);
      setDone({
        title: t("Okej, du avstod", "Okay, you skipped it"),
        text: t(
          "Budgeten är oförändrad. Inga pengar har flyttats till sparande – vill du sätta undan dem gör du det själv, och registrerar insättningen under Plan.",
          "Your budget is unchanged. No money has been moved to savings – if you want to put it aside you do that yourself, and record the deposit under Plan.",
        ),
      });
      setStep("done");
    });
  }
  function confirmMove() {
    const mv = ev?.result.move;
    if (!mv) return;
    start(async () => {
      const r = await moveBudgetAction({ fromCategoryId: mv.fromCategoryId, toCategoryId: mv.toCategoryId, amountOre: mv.amountOre });
      if (r.error) return setError(r.error);
      setSheet(null);
      runCheck();
    });
  }

  return (
    <div className="flow" data-step={step}>
      <div className="flow-top">
        <span className="caps" style={{ paddingLeft: 10 }}>
          Ryms det?
        </span>
        <Link href={initial?.checkId ? "/sparat" : "/"} className="iconbtn" aria-label={t("Stäng", "Close")}>
          <CloseIcon />
        </Link>
      </div>

      {step === "start" && (
        <div className="flow-body">
          <h1>{t("Vad funderar du på?", "What are you thinking of buying?")}</h1>
          <p className="muted">{t("Ta en bild i butiken, eller ladda upp en bild du redan har – ett foto eller en skärmbild från en nätbutik.", "Take a photo in the shop, or upload an image you already have – a photo or a screenshot from a web shop.")}</p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPick(e, "photo")} data-testid="camera-input" />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPick(e, "screenshot")} data-testid="file-input" />
          <div className="choices">
            <button type="button" className="choice primary" disabled={!aiAvailable} onClick={() => cameraRef.current?.click()} style={!aiAvailable ? { opacity: 0.45 } : undefined}>
              <span className="ico-dot">
                <CameraIcon size={22} />
              </span>
              <span>
                <b>{t("Ta en bild", "Take a photo")}</b>
                <small>{t("Varan och prislappen", "The item and the price tag")}</small>
              </span>
            </button>
            <button type="button" className="choice" disabled={!aiAvailable} onClick={() => fileRef.current?.click()} style={!aiAvailable ? { opacity: 0.45 } : undefined}>
              <span className="ico-dot">
                <ImageIcon size={22} />
              </span>
              <span>
                <b>{t("Ladda upp en bild", "Upload an image")}</b>
                <small>{t("Foto eller skärmbild från ditt bibliotek", "A photo or screenshot from your library")}</small>
              </span>
            </button>
            <button type="button" className="choice" onClick={() => setStep("confirm")} data-testid="manual">
              <span className="ico-dot">
                <PenIcon size={22} />
              </span>
              <span>
                <b>{t("Skriv själv", "Type it in")}</b>
                <small>{t("Vara och pris", "Item and price")}</small>
              </span>
            </button>
          </div>
          {error && <p className="error" style={{ marginTop: 14 }}>{error}</p>}
          {!aiAvailable && (
            <p className="note" style={{ marginTop: 14 }}>
              <InfoIcon size={16} />
              <span>{t("Bildanalysen är inte påslagen i den här installationen. Att skriva själv fungerar precis lika bra – uträkningen är densamma.", "Image analysis is not switched on in this installation. Typing it in works just as well – the calculation is the same.")}</span>
            </p>
          )}
          {demo && samples.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <span className="caps lilac">{t("Demo: prova med en exempelbild", "Demo: try a sample image")}</span>
              <div className="samples">
                {samples.map((s) => (
                  <button type="button" key={s.key} onClick={() => pickSample(s.key, s.file)} data-testid={`sample-${s.key}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.file} alt="" />
                    {s.title}
                  </button>
                ))}
              </div>
              <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                {t("Exempelbilderna har förbestämda svar och skickas inte till någon AI-tjänst.", "The sample images have fixed answers and are not sent to any AI service.")}
              </p>
            </div>
          )}
          {aiAvailable && (
            <p className="faint" style={{ fontSize: 12.5, marginTop: "auto", paddingTop: 20, display: "flex", gap: 8 }}>
              <ShieldIcon size={16} />
              <span>{t("Bilden används bara för att känna igen vara och pris och sparas inte, om du inte själv väljer det.", "The image is only used to recognise the item and price, and is not saved unless you choose to.")}</span>
            </p>
          )}
        </div>
      )}

      {step === "analyzing" && (
        <div className="flow-body" style={{ justifyContent: "center", textAlign: "center" }} role="status">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="" className="preview" style={{ margin: "0 auto 22px", width: 120, height: 120 }} />}
          <div className="spinner" />
          <p className="serif" style={{ fontSize: 30 }}>{t("Läser av bilden…", "Reading the image…")}</p>
        </div>
      )}

      {step === "confirm" && (
        <form className="flow-body" onSubmit={submitConfirm} noValidate>
          <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "14px 0 18px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt={t("Bilden du valde", "The image you chose")} className="preview" />}
            <div>
              <h1 style={{ fontSize: 38, margin: 0 }}>{suggestion ? t("Stämmer det här?", "Is this right?") : t("Vad vill du köpa?", "What do you want to buy?")}</h1>
              {suggestion && <p className="muted" style={{ marginTop: 6, fontSize: 13.5 }}>{suggestion.source === "demo" ? t("Förslag från demons exempelbild. Ändra det som är fel.", "Suggested from the demo sample image. Change anything that is wrong.") : t("Förslag från bilden. Ändra det som är fel.", "Suggested from the image. Change anything that is wrong.")}</p>}
            </div>
          </div>

          {notice && (
            <p className="note warn" style={{ marginBottom: 16 }} role="status">
              <InfoIcon size={16} />
              <span>{notice}</span>
            </p>
          )}

          {questionOpen && suggestion?.question && (
            <div className="question" data-testid="question">
              <p>{suggestion.question.text}</p>
              {suggestion.question.kind === "multiple_prices" && (
                <div className="pills">
                  {suggestion.options.map((o, i) => (
                    <button
                      type="button"
                      key={i}
                      className="pill"
                      onClick={() => {
                        setPrice(oreToInput(o.amountOre));
                        setQuestionOpen(false);
                      }}
                    >
                      {formatKr(o.amountOre)}
                      {o.label ? ` · ${o.label}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {suggestion.question.kind === "currency" && suggestion.options[0]?.currency === "UNKNOWN" && (
                <div className="pills">
                  <button type="button" className="pill" onClick={() => { setPrice(oreToInput(suggestion.options[0].amountOre)); setQuestionOpen(false); }}>
                    {t("Ja", "Yes")}, {formatKr(suggestion.options[0].amountOre)}
                  </button>
                  <button type="button" className="pill" onClick={() => { setQuestionOpen(false); priceRef.current?.focus(); }}>
                    {t("Nej, jag skriver priset", "No, I'll type the price")}
                  </button>
                </div>
              )}
            </div>
          )}

          <label className="field">
            <span>{t("Vad är det?", "What is it?")}</span>
            <input value={itemName} onChange={(e) => { setItemName(e.target.value); setPlannedAnswered(false); setPlannedId(null); }} maxLength={80} placeholder={t("t.ex. vinterjacka", "e.g. winter jacket")} autoComplete="off" data-testid="item" />
          </label>
          <label className="field kr">
            <span>{t("Pris", "Price")}</span>
            <input ref={priceRef} value={price} onChange={(e) => { setPrice(e.target.value); if (suggestion?.question?.kind !== "multiple_prices") setQuestionOpen(false); }} inputMode="decimal" placeholder="0" autoComplete="off" data-testid="price" aria-invalid={price !== "" && priceOre == null} />
          </label>
          <label className="field">
            <span>{t("Kategori", "Category")}</span>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPlannedId(null); setPlannedAnswered(false); }} data-testid="category">
              <option value="">{t("Ingen kategori", "No category")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {askPlanned && likely && (
            <div className="question" data-testid="planned-question">
              <p>
                {t(`Är det här ”${likely.name}” som du planerade för? Du har reserverat ${formatKr(likely.maxOre)}.`, `Is this the ”${likely.name}” you planned for? You have reserved ${formatKr(likely.maxOre)}.`)}
              </p>
              <div className="pills">
                <button type="button" className="pill" onClick={() => { setPlannedId(likely.id); setCategoryId(likely.categoryId); setPlannedAnswered(true); }} data-testid="planned-yes">
                  {t("Ja, det är den", "Yes, that's it")}
                </button>
                <button type="button" className="pill" onClick={() => { setPlannedId(null); setPlannedAnswered(true); }} data-testid="planned-no">
                  {t("Nej, något annat", "No, something else")}
                </button>
              </div>
            </div>
          )}
          {!askPlanned && candidates.length > 0 && (
            <label className="field">
              <span>{t("Hör det till ett planerat köp?", "Is it part of a planned purchase?")}</span>
              <select value={plannedId ?? ""} onChange={(e) => { setPlannedId(e.target.value || null); setPlannedAnswered(true); const c = candidates.find((x) => x.id === e.target.value); if (c) setCategoryId(c.categoryId); }} data-testid="planned-select">
                <option value="">{t("Nej, inget planerat", "No, nothing planned")}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({t("högst", "max")} {formatKr(c.maxOre)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="error" role="alert">{error}</p>}
          <div style={{ marginTop: "auto", paddingTop: 10 }} className="btn-row">
            <button className="btn" disabled={busy} data-testid="check">
              {busy ? t("Räknar…", "Calculating…") : "Ryms det?"}
            </button>
            {!initial?.checkId && (
              <button type="button" className="btn quiet" onClick={() => { setStep("start"); setSuggestion(null); setNotice(null); setError(null); }}>
                {t("Börja om", "Start over")}
              </button>
            )}
          </div>
        </form>
      )}

      {step === "result" && ev && (
        <div className="flow-body" data-testid="result" data-verdict={ev.result.verdict}>
          <div className="verdict">
            <Landscape tone={tone} sunX={0.5} />
            <span className="caps">
              {ev.request.itemName} · {formatKr(ev.request.priceOre)}
            </span>
            <h1 data-testid="headline">{ev.explanation.headline}</h1>
            <p data-testid="answer">{ev.explanation.text.startsWith(`${ev.explanation.headline}. `) ? ev.explanation.text.slice(ev.explanation.headline.length + 2) : ev.explanation.text}</p>
          </div>

          <div className="result-body">
            {ev.explanation.rows.length > 0 && (
              <section className="card">
                <div className="rows calc">
                  {ev.explanation.rows.map((r, i) => (
                    <div className={`row${r.strong ? " total" : ""}`} key={i}>
                      <div className="grow title">{r.label}</div>
                      <div className="amt num">{formatKr(r.amountOre)}</div>
                    </div>
                  ))}
                  {ev.result.cash.status !== "unknown" && (
                    <div className="row">
                      <div className="grow">
                        <div className="title">{t("Kvar till lön efter köpet", "Left until payday after the purchase")}</div>
                        <div className="sub">{t("efter räkningar och planerat sparande", "after bills and planned saving")}</div>
                      </div>
                      <div className="amt num">{formatKr(ev.result.cash.leftAfterOre)}</div>
                    </div>
                  )}
                </div>
              </section>
            )}
            {ev.explanation.notes.map((n, i) => (
              <p className="note" key={i}>
                <InfoIcon size={16} />
                <span>{n}</span>
              </p>
            ))}
            {ev.result.move && (
              <button type="button" className="btn ghost" onClick={() => setSheet("move")} data-testid="move">
                {t("Flytta", "Move")} {formatKr(ev.result.move.amountOre)} {t("från", "from")} {lower(ev.result.move.fromName, locale)}
              </button>
            )}

            {error && <p className="error" role="alert">{error}</p>}
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button type="button" className="btn" onClick={() => setSheet("bought")} data-testid="bought">
                {t("Jag köpte den", "I bought it")}
              </button>
              <div className="btn-row two">
                <button type="button" className="btn ghost" onClick={() => { setKeepImage(false); setSheet("save"); }} data-testid="save">
                  {t("Spara till senare", "Save for later")}
                </button>
                <button type="button" className="btn ghost" onClick={doSkip} disabled={busy} data-testid="skip">
                  {t("Avstå", "Skip it")}
                </button>
              </div>
              <button type="button" className="btn quiet" onClick={() => setStep("confirm")} data-testid="edit">
                {t("Ändra vara eller pris", "Change item or price")}
              </button>
            </div>

            {response?.comparisons && response.comparisons.length > 0 && (
              <section className="card compare" data-testid="compare">
                <span className="caps lilac">{t("Demo: samma köp, andra budgetar", "Demo: same purchase, other budgets")}</span>
                <div className="rows" style={{ marginTop: 8 }}>
                  {response.comparisons.map((c) => (
                    <div className="row" key={c.key}>
                      <span className={`dot ${c.verdict}`} />
                      <div className="grow">
                        <div className="title">
                          {c.label}: {lower(c.headline, locale)}
                        </div>
                        <div className="sub">{c.text}</div>
                        <button
                          type="button"
                          className="linkish"
                          style={{ marginTop: 6 }}
                          onClick={() => start(() => switchDemoAction(c.key, `/ryms-det?vara=${encodeURIComponent(ev.request.itemName)}&pris=${ev.request.priceOre}&kat=${encodeURIComponent(ev.categoryName ?? "")}&auto=1`))}
                        >
                          {t("Byt till den budgeten", "Switch to that budget")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {step === "done" && done && (
        <div className="flow-body" style={{ justifyContent: "center", textAlign: "center" }} data-testid="done">
          <span className="glyph" style={{ margin: "0 auto 16px", width: 52, height: 52 }}>
            <CheckIcon size={26} />
          </span>
          <h1 style={{ fontSize: 42, margin: "0 0 12px" }}>{done.title}</h1>
          <p className="muted" style={{ maxWidth: "32ch", margin: "0 auto 28px" }}>
            {done.text}
          </p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => router.push("/")} data-testid="to-home">
              {t("Till översikten", "To the overview")}
            </button>
            <a href="/ryms-det" className="btn ghost">
              {t("Kolla något mer", "Check something else")}
            </a>
          </div>
        </div>
      )}

      <Sheet open={sheet === "bought"} onClose={() => setSheet(null)} title={t("Registrera köpet?", "Record the purchase?")}>
        <p className="muted" style={{ marginBottom: 18 }}>
          {t(
            `${formatKr(request.priceOre)} räknas av${category ? ` från ${lower(category.name, locale)}` : ""}${plannedId ? " och reservationen för det planerade köpet används" : ""}. Ingenting betalas via Ryms – du registrerar bara att köpet är gjort.`,
            `${formatKr(request.priceOre)} will be deducted${category ? ` from ${lower(category.name, locale)}` : ""}${plannedId ? " and the reservation for the planned purchase is used" : ""}. Nothing is paid through Ryms – you are only recording that the purchase is made.`,
          )}
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={confirmBought} disabled={busy} data-testid="confirm-bought">
            {busy ? t("Sparar…", "Saving…") : t("Ja, registrera köpet", "Yes, record the purchase")}
          </button>
          <button type="button" className="btn quiet" onClick={() => setSheet(null)}>
            {t("Avbryt", "Cancel")}
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === "save"} onClose={() => setSheet(null)} title={t("Spara till senare", "Save for later")}>
        <p className="muted" style={{ marginBottom: 8 }}>{t("Saken sparas med pris och kategori. Budgeten ändras inte.", "The item is saved with its price and category. Your budget does not change.")}</p>
        {image && (
          <label className="check">
            <input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} data-testid="keep-image" />
            <span>
              {t("Spara bilden också", "Save the image too")}
              <br />
              <span className="muted" style={{ fontSize: 13 }}>{t("Bara du kan se den, och du kan radera den när du vill. Annars slängs bilden nu.", "Only you can see it, and you can delete it whenever you like. Otherwise the image is discarded now.")}</span>
            </span>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn" onClick={confirmSave} disabled={busy} data-testid="confirm-save">
            {busy ? t("Sparar…", "Saving…") : t("Spara", "Save")}
          </button>
        </div>
      </Sheet>

      <Sheet open={sheet === "move"} onClose={() => setSheet(null)} title={t("Flytta budget?", "Move budget?")}>
        {ev?.result.move && (
          <>
            <p className="muted" style={{ marginBottom: 18 }}>
              {t(
                `${formatKr(ev.result.move.amountOre)} flyttas från ${lower(ev.result.move.fromName, locale)} till ${lower(ev.categoryName, locale)} – bara den här månaden. ${ev.result.move.fromName} har ${formatKr(ev.result.move.fromFreeOre)} som inte är reserverat.`,
                `${formatKr(ev.result.move.amountOre)} is moved from ${lower(ev.result.move.fromName, locale)} to ${lower(ev.categoryName, locale)} – this month only. ${ev.result.move.fromName} has ${formatKr(ev.result.move.fromFreeOre)} that is not reserved.`,
              )}
            </p>
            {error && <p className="error">{error}</p>}
            <div className="btn-row">
              <button type="button" className="btn" onClick={confirmMove} disabled={busy} data-testid="confirm-move">
                {t("Ja, flytta", "Yes, move it")}
              </button>
              <button type="button" className="btn quiet" onClick={() => setSheet(null)}>
                {t("Avbryt", "Cancel")}
              </button>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!pendingFile} onClose={() => setPendingFile(null)} title={t("Innan bilden skickas", "Before the image is sent")}>
        <p style={{ marginBottom: 12 }}>
          {t("För att känna igen varan och priset skickas bilden till Anthropics AI-tjänst Claude.", "To recognise the item and the price, the image is sent to Anthropic's AI service Claude.")}
        </p>
        <ul className="muted" style={{ paddingLeft: 18, margin: "0 0 16px", display: "grid", gap: 8 }}>
          <li>{t("Det som skickas är bilden och namnen på dina budgetkategorier.", "What is sent is the image and the names of your budget categories.")}</li>
          <li>{t("Saldon, transaktioner och bankuppgifter skickas aldrig.", "Balances, transactions and bank details are never sent.")}</li>
          <li>{t("Ryms sparar inte bilden efter analysen, om du inte själv väljer att spara den.", "Ryms does not keep the image after the analysis unless you choose to save it.")}</li>
          <li>{t("Undvik bilder där personer eller personuppgifter syns.", "Avoid images that show people or personal details.")}</li>
        </ul>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            data-testid="consent-yes"
            onClick={() => {
              const p = pendingFile;
              setPendingFile(null);
              setConsented(true);
              void aiConsentAction(true).then(() => p && sendFile(p.file, p.source));
            }}
          >
            {t("Godkänn och analysera bilden", "Agree and analyse the image")}
          </button>
          <button type="button" className="btn quiet" onClick={() => { setPendingFile(null); setStep("confirm"); }}>
            {t("Skriv själv i stället", "Type it in instead")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
