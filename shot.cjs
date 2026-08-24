const { chromium } = require("playwright");
(async () => {
  const [url, out, w, full] = process.argv.slice(2);
  const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: Number(w)||1440, height: 1200 }, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(e.message.slice(0,120)));
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
  await p.waitForSelector("h1", { timeout: 45000 }).catch(()=>{});
  await p.waitForTimeout(5000);
  await p.screenshot({ path: out, fullPage: full === "full" });
  const containers = await p.evaluate(() => document.querySelectorAll(".workspace-page section, .workspace-page article, .workspace-month-breakdown button").length);
  console.log("saved", out, "| containers:", containers, "| pageerrors:", errs.length ? errs.slice(0,2) : "none");
  await b.close();
})();
