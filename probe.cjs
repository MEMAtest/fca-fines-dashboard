const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto("https://regactions.com/fines/actions", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
  await p.waitForSelector("h1", { timeout: 45000 }).catch(()=>{});
  await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => document.querySelector(".workspace-page__heading--band") ? "new" : "old"));
  await b.close();
})();
