/**
 * GENERATED FILE — do not hand-edit.
 * Produced by scripts/register/sanctions/generateSanctionsChangeLog.ts
 * Flat list of register_change_log rows with category = 'sanctions' (FATF
 * rows are intentionally excluded here — see that script's module comment
 * for why). Empty until the daily sanctions ingest lane has written its
 * first diff.
 */

export interface RegisterSanctionsChangeEvent {
  iso2: string;
  eventDate: string;
  summary: string;
  sourceUrl: string;
}

export const REGISTER_SANCTIONS_CHANGE_LOG: RegisterSanctionsChangeEvent[] =
[
  {
    "iso2": "RU",
    "eventDate": "2026-10-02",
    "summary": "OFAC: +3 designations linked to RU, programme RUSSIA-EO14024",
    "sourceUrl": "https://ofac.treasury.gov/sanctions-list-service"
  }
];
