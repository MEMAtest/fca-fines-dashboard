import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Printer } from "lucide-react";
import "../styles/print.css";

/** Pages that offer a branded print / PDF export. */
export function isPrintablePath(pathname: string): boolean {
  return /^\/(regulators|countries)\/[^/]+/.test(pathname) && !/^\/countries\/(methodology|changes|fatf-grey-list|regulatory-transparency|compare)/.test(pathname);
}

const MAX_SOURCES = 12;

/** Fill the print-only chrome from the live page. Imperative so it is ready synchronously at print time. */
export function preparePrint() {
  const root: ParentNode = document;
  const main = document.getElementById("main-content");
  const title = main?.querySelector("h1")?.textContent?.trim() || document.title;
  const now = new Date();
  const asOfDate = main?.querySelector<HTMLElement>("[data-print-asof]")?.dataset.printAsof;
  const set = (selector: string, text: string) => {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
  };
  set("[data-print-title]", title);
  set("[data-print-asof-label]", `As of ${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${asOfDate ? ` · ${asOfDate}` : ""}`);
  const url = `https://regactions.com${window.location.pathname}`;
  set("[data-print-url]", url);
  set("[data-print-footer-url]", url);

  const seen = new Set<string>();
  const list = root.querySelector("[data-print-sources]");
  if (list) {
    list.replaceChildren();
    for (const anchor of Array.from(main?.querySelectorAll<HTMLAnchorElement>("a[href^='http']") ?? [])) {
      let parsed: URL;
      try { parsed = new URL(anchor.href); } catch { continue; }
      if (parsed.hostname.endsWith("regactions.com") || seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      const li = document.createElement("li");
      li.textContent = `${anchor.textContent?.trim() || parsed.hostname} - ${parsed.href}`;
      list.appendChild(li);
      if (seen.size >= MAX_SOURCES) break;
    }
    if (!seen.size) {
      const li = document.createElement("li");
      li.textContent = "Official regulator and FATF publications; each record links to its source on regactions.com.";
      list.appendChild(li);
    }
  }
}

/** Print-only letterhead, source list and running footer. Hidden on screen. */
export function PrintBrand() {
  const { pathname } = useLocation();
  
  const printable = isPrintablePath(pathname);

  useEffect(() => {
    if (!printable) return;
    const opened: HTMLDetailsElement[] = [];
    const before = () => {
      preparePrint();
      document.querySelectorAll<HTMLDetailsElement>("#main-content details:not([open])").forEach((d) => { d.open = true; opened.push(d); });
    };
    const after = () => { opened.splice(0).forEach((d) => { d.open = false; }); };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [printable, pathname]);

  if (!printable) return null;
  return (
    <div className="print-brand" aria-hidden="true">
      <header className="print-brand__head">
        <img src="/regactions-mark.svg" alt="" width={36} height={36} />
        <div>
          <strong className="print-brand__wordmark">RegActions</strong>
          <span className="print-brand__tag">Global regulatory enforcement intelligence</span>
        </div>
        <div className="print-brand__meta"><span data-print-asof-label /><span data-print-url /></div>
      </header>
      <h2 className="print-brand__title" data-print-title />
      <footer className="print-brand__footer"><span>RegActions · <span data-print-footer-url /></span></footer>
    </div>
  );
}

/** Print-only source list, rendered after the page content. */
export function PrintSources() {
  const { pathname } = useLocation();
  if (!isPrintablePath(pathname)) return null;
  return (
    <section className="print-brand print-brand__sources" aria-hidden="true">
      <h3>Sources cited on this page</h3>
      <ol data-print-sources />
      <p>RegActions supports professional assessment; it is not legal advice. Data: RegActions - regactions.com (CC BY-NC 4.0).</p>
    </section>
  );
}

export function PrintButton({ className = "cx-btn" }: { className?: string }) {
  const onClick = () => {
    preparePrint();
    window.print();
  };
  return (
    <button type="button" className={className} onClick={onClick} data-print-button>
      <Printer size={14} aria-hidden="true" /> Print / save PDF
    </button>
  );
}
