const { chromium } = require("playwright");
(async () => {
  const [url, out, w] = process.argv.slice(2);
  const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: Number(w)||1440, height: 1150 }, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,110)));
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
  await p.waitForSelector("h1", { timeout: 45000 }).catch(()=>{});
  await p.waitForTimeout(5000);
  // open the first row so the expansion is in shot
  const row = await p.$(".workspace-table--enforcement tbody tr");
  if (row) { await row.scrollIntoViewIfNeeded(); await row.click(); await p.waitForTimeout(700); }
  const box = await p.$(".workspace-card--full:last-of-type");
  if (box) await box.screenshot({ path: out }); else await p.screenshot({ path: out });
  console.log("saved", out, "| errors:", errs.length ? errs.slice(0,2) : "none");
  await b.close();
})();
