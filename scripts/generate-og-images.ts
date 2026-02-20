/**
 * Generate unique OG images (1200x630) for each blog article.
 *
 * Uses satori to render a branded card with title overlay,
 * then converts SVG to PNG via @resvg/resvg-js.
 *
 * Output: dist/og/{slug}.png
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const OG_DIR = join(DIST, 'og');

import { blogArticles, yearlyArticles } from '../src/data/blogArticles.js';

const WIDTH = 1200;
const HEIGHT = 630;

async function main() {
  // Load font
  const fontPath = join(__dirname, 'fonts', 'SpaceGrotesk-Bold.ttf');
  if (!existsSync(fontPath)) {
    console.error('ERROR: SpaceGrotesk-Bold.ttf not found at', fontPath);
    process.exit(1);
  }
  const fontBuffer = readFileSync(fontPath);
  const fontData = fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength);

  // Ensure output directory exists
  if (!existsSync(OG_DIR)) {
    mkdirSync(OG_DIR, { recursive: true });
  }

  const allArticles = [
    ...blogArticles.map(a => ({ slug: a.slug, title: a.title, category: a.category })),
    ...yearlyArticles.map(a => ({ slug: a.slug, title: a.title, category: 'Annual Analysis' })),
  ];

  console.log(`Generating ${allArticles.length} OG images...`);

  for (const article of allArticles) {
    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            width: WIDTH,
            height: HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '60px',
            background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 40%, #0f3b3d 100%)',
            fontFamily: 'Space Grotesk',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  position: 'absolute',
                  top: '40px',
                  left: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#0FA294',
                      },
                      children: '',
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        color: '#94a3b8',
                        fontSize: '22px',
                        letterSpacing: '0.5px',
                      },
                      children: 'FCA Fines Dashboard',
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  marginBottom: '20px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        background: 'rgba(15, 162, 148, 0.2)',
                        color: '#0FA294',
                        fontSize: '16px',
                        fontWeight: 700,
                        padding: '6px 16px',
                        borderRadius: '20px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      },
                      children: article.category,
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  color: '#ffffff',
                  fontSize: article.title.length > 60 ? '36px' : '44px',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  maxWidth: '900px',
                },
                children: article.title,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  marginTop: '20px',
                  color: '#64748b',
                  fontSize: '18px',
                },
                children: 'fcafines.memaconsultants.com',
              },
            },
          ],
        },
      },
      {
        width: WIDTH,
        height: HEIGHT,
        fonts: [
          {
            name: 'Space Grotesk',
            data: fontData,
            weight: 700,
            style: 'normal',
          },
        ],
      }
    );

    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
    });
    const png = resvg.render().asPng();

    const outPath = join(OG_DIR, `${article.slug}.png`);
    writeFileSync(outPath, png);
  }

  console.log(`  Created ${allArticles.length} OG images in dist/og/`);
}

main().catch((error) => {
  console.error('OG image generation failed:', error);
  process.exit(1);
});
