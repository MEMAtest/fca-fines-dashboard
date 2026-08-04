import type { VercelRequest, VercelResponse } from "@vercel/node";

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, follow" />
    <title>Page Not Found | RegActions</title>
    <style>
      body { margin: 0; background: #f7f8f5; color: #17231d; font: 16px/1.6 system-ui, sans-serif; }
      main { max-width: 680px; margin: 12vh auto; padding: 40px; }
      p:first-child { color: #627268; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      h1 { font-size: clamp(2rem, 7vw, 4rem); line-height: 1.05; margin: 12px 0; }
      a { color: #1d6546; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <p>Error 404</p>
      <h1>That page is not available.</h1>
      <p>The address may have changed, or the page may no longer exist.</p>
      <p><a href="/">Return to RegActions</a> or <a href="/search">search enforcement actions</a>.</p>
    </main>
  </body>
</html>`;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("X-Robots-Tag", "noindex, follow");
  return res.status(404).send(NOT_FOUND_HTML);
}
