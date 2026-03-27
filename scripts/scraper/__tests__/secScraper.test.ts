import { describe, expect, it } from 'vitest';
import {
  extractSecPrimaryEntity,
  isLikelySecEnforcementTitle,
  parseSecMonetaryRelief,
  parseSecPressReleaseListing,
} from '../scrapeSec.js';

describe('SEC scraper', () => {
  it('parses SEC press release listing rows', () => {
    const html = `
      <table>
        <tbody>
          <tr class="pr-list-page-row">
            <td class="views-field-field-publish-date"><time datetime="2026-01-27T16:38:34Z" class="datetime">Jan. 27, 2026</time></td>
            <td class="views-field-field-display-title"><a href="/newsroom/press-releases/2026-15-sec-charges-adm-three-former-executives-accounting-disclosure-fraud">SEC Charges ADM and Three Former Executives with Accounting and Disclosure Fraud</a></td>
            <td class="views-field-field-release-number">2026-15</td>
          </tr>
        </tbody>
      </table>
    `;

    const rows = parseSecPressReleaseListing(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateIssued).toBe('2026-01-27');
    expect(rows[0].releaseNumber).toBe('2026-15');
    expect(rows[0].detailUrl).toContain('2026-15-sec-charges-adm-three-former-executives-accounting-disclosure-fraud');
  });

  it('filters likely enforcement titles', () => {
    expect(isLikelySecEnforcementTitle('SEC Charges ADM and Three Former Executives with Accounting and Disclosure Fraud')).toBe(true);
    expect(isLikelySecEnforcementTitle('SEC Publishes Staff Report on Capital-Raising Dynamics')).toBe(false);
  });

  it('extracts primary entity names from SEC titles', () => {
    expect(extractSecPrimaryEntity('SEC Charges ADM and Three Former Executives with Accounting and Disclosure Fraud')).toBe(
      'ADM and Three Former Executives',
    );
    expect(extractSecPrimaryEntity('SEC Sues Crypto Platform Example LLC for Misleading Investors')).toBe(
      'Crypto Platform Example LLC',
    );
  });

  it('sums monetary relief from SEC release text', () => {
    const body = `
      The SEC’s order finds that ADM, Macciocchi, and Young violated the antifraud provisions.

      ADM agreed to pay a $40,000,000 civil penalty, Macciocchi agreed to pay disgorgement and prejudgment interest totaling $404,343 and a civil penalty of $125,000, and Young agreed to pay disgorgement and prejudgment interest totaling $575,610 and a civil penalty of $75,000.
    `;

    expect(parseSecMonetaryRelief(body)).toBe(41179953);
  });
});
