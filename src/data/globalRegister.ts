/**
 * GENERATED FILE — do not hand-edit. Produced by
 * scripts/register/generateSnapshot.ts from the Phase 0 reconciliation
 * output (importAtlas.ts + reconcileDirectory.ts), itself seeded from
 * docs/research/regulatory-signal/official-authority-directory.json (643
 * sourced authorities) and src/data/egmontMembership.ts.
 *
 * Published (grade A/B) rows ONLY. Grade-C atlas drafts are never emitted
 * here — a missing role must render as "Not yet mapped — source check
 * pending" in the UI, never as an absence-implies-clean state.
 *
 * 614 authority rows across 212 countries;
 * 42 legal-instrument rows.
 */

import type { RegisterAuthority, RegisterLegalInstrument, RegisterAuthorityRole } from "./globalRegisterTypes.js";
import { COUNTRIES } from "./countries.js";

export const GLOBAL_REGISTER_REVIEWED = "2026-10-03";
export const GLOBAL_REGISTER_SHA256 = "144f223db6f1e6d016e0bd3a5941e1e74738953c8faae6cc75192a30e21bcf7e";

export const GLOBAL_REGISTER_AUTHORITIES: RegisterAuthority[] = [
  {
    "iso2": "AD",
    "name": "Financial Intelligence Unit-Andorra (FIUAND)",
    "url": "http://www.uifand.ad/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AE",
    "name": "Central Bank of the United Arab Emirates",
    "url": "https://www.centralbank.ae/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBUAE"
  },
  {
    "iso2": "AE",
    "name": "United Arab Emirates Financial Intelligence Unit (UAEFIU)",
    "url": "https://www.uaefiu.gov.ae/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AE",
    "name": "Central Bank of the United Arab Emirates",
    "url": "https://www.centralbank.ae/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBUAE"
  },
  {
    "iso2": "AE",
    "name": "Dubai Financial Services Authority",
    "url": "http://www.dfsa.ae/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "DFSA"
  },
  {
    "iso2": "AF",
    "name": "Bank of Afghanistan",
    "url": "https://www.dab.gov.af/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AG",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AG",
    "name": "Office of National Drug and Money Laundering Control Policy (ONDCP)",
    "url": "http://ondcp.gov.ag/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AG",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AI",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AI",
    "name": "Financial Services Commission",
    "url": "http://www.fsc.org.ai/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AI",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AI",
    "name": "Financial Services Commission",
    "url": "http://www.fsc.org.ai/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AL",
    "name": "Bank of Albania",
    "url": "https://www.bankofalbania.org/home/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AL",
    "name": "Albanian Financial Intelligence Agency (FIA)",
    "url": "http://www.fiu.gov.al/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AL",
    "name": "Bank of Albania",
    "url": "https://www.bankofalbania.org/home/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AM",
    "name": "Central Bank of Armenia",
    "url": "http://www.cba.am/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AM",
    "name": "Central Bank of Armenia",
    "url": "http://www.cba.am/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AM",
    "name": "Central Bank of Armenia",
    "url": "http://www.cba.am/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AO",
    "name": "National Bank of Angola",
    "url": "http://www.bna.ao/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AO",
    "name": "Unidade de Informação Financeira (UIF-Angola)",
    "url": "http://www.uif.ao/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AO",
    "name": "National Bank of Angola",
    "url": "http://www.bna.ao/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AR",
    "name": "Central Bank of Argentina",
    "url": "http://www.bcra.gob.ar/default.asp",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AR",
    "name": "Superintendencia de Seguros de la Nacion Argentina",
    "url": "https://www.argentina.gob.ar/superintendencia-de-seguros",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "IAIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AR",
    "name": "Central Bank of Argentina",
    "url": "http://www.bcra.gob.ar/default.asp",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AT",
    "name": "Central Bank of the Republic of Austria",
    "url": "https://www.oenb.at/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AT",
    "name": "Austrian Financial Intelligence Unit (A-FIU)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AT",
    "name": "Austrian Financial Market Authority",
    "url": "http://www.fma.gv.at/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AT",
    "name": "Central Bank of the Republic of Austria",
    "url": "https://www.oenb.at/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AU",
    "name": "Reserve Bank of Australia",
    "url": "http://www.rba.gov.au/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AU",
    "name": "The Australian Transaction Reports and Analysis Centre (AUSTRAC)",
    "url": "http://www.austrac.gov.au/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": "AUSTRAC"
  },
  {
    "iso2": "AU",
    "name": "Australian Prudential Regulation Authority",
    "url": "http://www.apra.gov.au/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AU",
    "name": "Reserve Bank of Australia",
    "url": "http://www.rba.gov.au/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AW",
    "name": "Central Bank of Aruba",
    "url": "http://www.cbaruba.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AW",
    "name": "Financial Intelligence Unit of Aruba (FIU-Aruba)",
    "url": "https://www.fiu-aruba.com/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AW",
    "name": "Central Bank of Aruba",
    "url": "http://www.cbaruba.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AZ",
    "name": "Central Bank of the Republic of Azerbaijan",
    "url": "https://www.cbar.az/home?language=en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AZ",
    "name": "Financial Monitoring Service (FMS)",
    "url": "http://www.fiu.az/eng/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "AZ",
    "name": "Central Bank of the Republic of Azerbaijan",
    "url": "https://www.cbar.az/home?language=en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BA",
    "name": "Central Bank of Bosnia and Herzegovina",
    "url": "http://www.cbbh.ba/?lang=en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BA",
    "name": "Financial Intelligence Department (FID)",
    "url": "http://www.sipa.gov.ba/en/about-us/structure/organisational-structure/financial-intelligence-department",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BA",
    "name": "Banking Agency of Republika Srpska",
    "url": "https://www.abrs.ba/?lang=en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BA",
    "name": "Banking Agency of the Federation of Bosnia and Herzegovina",
    "url": "http://www.fba.ba/?lang=en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BB",
    "name": "Central Bank of Barbados",
    "url": "http://www.centralbank.org.bb/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BB",
    "name": "Barbados Financial Intelligence Unit (FIU-Barbados)",
    "url": "http://www.barbadosfiu.gov.bb/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BB",
    "name": "Central Bank of Barbados",
    "url": "http://www.centralbank.org.bb/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BD",
    "name": "Bangladesh Bank",
    "url": "https://www.bb.org.bd/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BD",
    "name": "Bangladesh Bank",
    "url": "https://www.bb.org.bd/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BD",
    "name": "Bangladesh Bank",
    "url": "https://www.bb.org.bd/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BE",
    "name": "National Bank of Belgium",
    "url": "https://www.nbb.be/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BE",
    "name": "Belgian Financial Intelligence Processing Unit (CTIF-CFI)",
    "url": "http://www.ctif-cfi.be/website/index.php?lang=en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BE",
    "name": "National Bank of Belgium",
    "url": "https://www.nbb.be/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BF",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BF",
    "name": "The National Financial Information Processing Unit (CENTIF-BF) Burkina Faso",
    "url": "https://www.finances.gov.bf/attributions-et-missions/details?tx_news_pi1%5Baction%5D=detail&tx_news_pi1%5Bcontroller%5D=News&tx_news_pi1%5Bnews%5D=22&cHash=7617b644d576b1b7f9b4ff6f4067adf9",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BF",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BG",
    "name": "Bulgarian National Bank",
    "url": "http://www.bnb.bg/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BG",
    "name": "Financial Intelligence Directorate – State Agency for National Security (FID-SANS)",
    "url": "http://www.dans.bg/en/msip-091209-menu-en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BG",
    "name": "Bulgarian National Bank",
    "url": "http://www.bnb.bg/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BH",
    "name": "Central Bank of Bahrain",
    "url": "http://www.cbb.gov.bh/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BH",
    "name": "Financial Intelligence National Center (FINC)",
    "url": "http://www.bahrainfiu.gov.bh/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BH",
    "name": "Central Bank of Bahrain",
    "url": "http://www.cbb.gov.bh/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BI",
    "name": "Bank of the Republic of Burundi",
    "url": "https://www.brb.bi/en",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BI",
    "name": "Bank of the Republic of Burundi",
    "url": "https://www.brb.bi/en",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BJ",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BJ",
    "name": "Cellule Nationale de Traitement des Informations Financieres du Benin (CENTIF)",
    "url": "http://www.fiub.org/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BJ",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BM",
    "name": "Bermuda Monetary Authority",
    "url": "http://www.bma.bm/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BM",
    "name": "Financial Intelligence Agency Bermuda (FIA)",
    "url": "https://www.fia.bm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BM",
    "name": "Bermuda Monetary Authority",
    "url": "http://www.bma.bm/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BN",
    "name": "Brunei Darussalam Central Bank",
    "url": "https://www.bdcb.gov.bn/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BN",
    "name": "Brunei Darussalam Central Bank",
    "url": "https://www.bdcb.gov.bn/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BO",
    "name": "Central Bank of Bolivia",
    "url": "https://www.bcb.gob.bo/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BO",
    "name": "Unidad de Investigaciones Financieras (UIF)",
    "url": "http://www.uif.gob.bo/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BO",
    "name": "Autoridad de Supervisión del Sistema Financiero",
    "url": "https://www.asfi.gob.bo/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BO",
    "name": "Central Bank of Bolivia",
    "url": "https://www.bcb.gob.bo/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BR",
    "name": "Central Bank of Brazil",
    "url": "https://www.bcb.gov.br/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BR",
    "name": "Council for Financial Activities Control (COAF)",
    "url": "https://www.coaf.fazenda.gov.br/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BR",
    "name": "Central Bank of Brazil",
    "url": "https://www.bcb.gov.br/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BS",
    "name": "Central Bank of The Bahamas",
    "url": "http://www.centralbankbahamas.com/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BS",
    "name": "Financial Intelligence Unit Bahamas (FIU-Bahamas)",
    "url": "https://www.fiubahamas.org.bs/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BS",
    "name": "Central Bank of The Bahamas",
    "url": "http://www.centralbankbahamas.com/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BT",
    "name": "Royal Monetary Authority of Bhutan",
    "url": "http://www.rma.org.bt/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BT",
    "name": "Royal Monetary Authority of Bhutan",
    "url": "http://www.rma.org.bt/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BT",
    "name": "Royal Monetary Authority of Bhutan",
    "url": "http://www.rma.org.bt/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BW",
    "name": "Bank of Botswana",
    "url": "http://www.bankofbotswana.bw/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BW",
    "name": "Financial Intelligence Unit (FIU) - Botswana",
    "url": "https://www.finance.gov.bw/index.php?Itemid=159&option=com_content&view=categories&id=36",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BW",
    "name": "Bank of Botswana",
    "url": "http://www.bankofbotswana.bw/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BY",
    "name": "National Bank of the Republic of Belarus",
    "url": "http://www.nbrb.by/engl/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BY",
    "name": "The Department of Financial Monitoring of the State Control Committee of the Republic of Belarus (DFM)",
    "url": "http://www.kgk.gov.by/en/contact_information_fmd-en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BY",
    "name": "National Bank of the Republic of Belarus",
    "url": "http://www.nbrb.by/engl/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BZ",
    "name": "Central Bank of Belize",
    "url": "http://www.centralbank.org.bz/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BZ",
    "name": "Financial Intelligence Unit Belize (FIU-Belize)",
    "url": "http://www.fiubelize.org/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "BZ",
    "name": "Central Bank of Belize",
    "url": "http://www.centralbank.org.bz/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CA",
    "name": "Bank of Canada",
    "url": "http://www.bankofcanada.ca/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CA",
    "name": "Financial Transactions and Reports Analysis Centre of Canada (FINTRAC-CANAFE)",
    "url": "https://fintrac-canafe.canada.ca/intro-eng",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CA",
    "name": "Office of the Superintendent of Financial Institutions",
    "url": "http://www.osfi-bsif.gc.ca/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CD",
    "name": "Central Bank of Congo",
    "url": "https://www.bcc.cd/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CD",
    "name": "Cellule Nationale des Renseignements Financiers (CENAREF)",
    "url": "https://www.cenaref.org/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CD",
    "name": "Central Bank of Congo",
    "url": "https://www.bcc.cd/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CF",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CF",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CG",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CG",
    "name": "Agence Nationale d’Investigation Financiere (ANIF)",
    "url": "http://www.anif.cg/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CH",
    "name": "Swiss National Bank",
    "url": "http://www.snb.ch/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CH",
    "name": "Money Laundering Reporting Office Switzerland (MROS)",
    "url": "https://www.fedpol.admin.ch/fedpol/en/home/kriminalitaet/geldwaescherei.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CH",
    "name": "Swiss Financial Market Supervisory Authority (FINMA)",
    "url": "http://www.finma.ch/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FINMA"
  },
  {
    "iso2": "CH",
    "name": "Swiss National Bank",
    "url": "http://www.snb.ch/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CI",
    "name": "Commission Bancaire de l'Union Monétaire Ouest Africaine",
    "url": "http://www.bceao.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CI",
    "name": "National Unit for the Processing of Financial Information in Côte d’Ivoire (CENTIF-CI)",
    "url": "https://www.centif.ci/index.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CI",
    "name": "Commission Bancaire de l'Union Monétaire Ouest Africaine",
    "url": "http://www.bceao.int/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CK",
    "name": "Financial Supervisory Commission",
    "url": "http://www.fsc.gov.ck/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CK",
    "name": "Financial Supervisory Commission",
    "url": "http://www.fsc.gov.ck/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CL",
    "name": "Central Bank of Chile",
    "url": "https://www.bcentral.cl/en/web/banco-central/home",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CL",
    "name": "Unidad de Analisis Financiero (UAF)",
    "url": "http://www.uaf.cl/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CL",
    "name": "Banking and Financial Institutions Supervisory Agency",
    "url": "http://www.sbif.cl/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CM",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CM",
    "name": "National Agency for Financial Investigation (NAFI)",
    "url": "http://www.anif.cm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CN",
    "name": "The People's Bank of China",
    "url": "http://www.pbc.gov.cn/en/3688006/index.html",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CN",
    "name": "China Banking Regulatory Commission",
    "url": "http://www.cbrc.gov.cn/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CN",
    "name": "The People's Bank of China",
    "url": "http://www.pbc.gov.cn/en/3688006/index.html",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CO",
    "name": "Central Bank of Colombia",
    "url": "http://www.banrep.gov.co/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CO",
    "name": "Unidad de Informacion y Analysis Financiero",
    "url": "https://www.uiaf.gov.co/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CO",
    "name": "Superintendencia Financiera de Colombia",
    "url": "http://www.superfinanciera.gov.co/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CR",
    "name": "Central Bank of Costa Rica",
    "url": "https://www.bccr.fi.cr/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CR",
    "name": "La Unidad de Inteligencia Financiera del Instituto Costarricense sobre Drogas (FIU-CDI)",
    "url": "https://icd.go.cr/portalicd/index.php/inicio-uif",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CR",
    "name": "Central Bank of Costa Rica",
    "url": "https://www.bccr.fi.cr/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CR",
    "name": "Superintendencia General de Entidades Financieras (SUGEF)",
    "url": "http://www.sugef.fi.cr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CU",
    "name": "Central Bank of Cuba",
    "url": "https://www.bc.gob.cu/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CU",
    "name": "Direccion General de Investigacion de Operaciones Financieras (DGIOF)",
    "url": "http://www.dgiof.bc.gob.cu:8081/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CU",
    "name": "Central Bank of Cuba",
    "url": "https://www.bc.gob.cu/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CV",
    "name": "Bank of Cape Verde",
    "url": "http://www.bcv.cv/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CV",
    "name": "Cape Verde UIF (UIF)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CV",
    "name": "Bank of Cape Verde",
    "url": "http://www.bcv.cv/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CW",
    "name": "Central Bank of Curaçao and Sint Maarten",
    "url": "http://www.centralbank.cw/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CW",
    "name": "Intelligence Unit – Curaçao (FIU -  Curaçao)",
    "url": "http://mot.cw/web/motweb/motweb.nsf/web/home?opendocument",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CW",
    "name": "Central Bank of Curaçao and Sint Maarten",
    "url": "http://www.centralbank.cw/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CY",
    "name": "Central Bank of Cyprus",
    "url": "https://www.centralbank.cy/en//home",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CY",
    "name": "Unit for Combating Money Laundering (MOKAS)",
    "url": "http://www.law.gov.cy/law/mokas/mokas.nsf/index_en/index_en?OpenDocument",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CY",
    "name": "Central Bank of Cyprus",
    "url": "https://www.centralbank.cy/en//home",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CZ",
    "name": "Czech National Bank",
    "url": "http://www.cnb.cz/en/index.html",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CNBCZ"
  },
  {
    "iso2": "CZ",
    "name": "Financial Analytical Unit (FAU-CR)",
    "url": "http://www.financnianalytickyurad.cz/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "CZ",
    "name": "Czech National Bank",
    "url": "http://www.cnb.cz/en/index.html",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CNBCZ"
  },
  {
    "iso2": "DE",
    "name": "Deutsche Bundesbank",
    "url": "http://www.bundesbank.de/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DE",
    "name": "Financial Intelligence Unit Germany (FIU)",
    "url": "http://www.fiu.bund.de/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DE",
    "name": "Deutsche Bundesbank",
    "url": "http://www.bundesbank.de/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DE",
    "name": "Federal Financial Supervisory Authority",
    "url": "http://www.bafin.de/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "BaFin"
  },
  {
    "iso2": "DJ",
    "name": "Banque Centrale de Djibouti",
    "url": "https://banque-centrale.dj/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DJ",
    "name": "Banque Centrale de Djibouti",
    "url": "https://banque-centrale.dj/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DK",
    "name": "Danmarks Nationalbank",
    "url": "http://www.nationalbanken.dk/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DK",
    "name": "The Money Laundering Secretariat (FIU Denmark)",
    "url": "https://www.hvidvask.dk/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DK",
    "name": "Danish Financial Supervisory Authority",
    "url": "http://www.finanstilsynet.dk/en.aspx",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FTDK"
  },
  {
    "iso2": "DK",
    "name": "Danmarks Nationalbank",
    "url": "http://www.nationalbanken.dk/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DM",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DM",
    "name": "Financial Intelligence Unit Dominica (FIU-Dominica)",
    "url": "http://fiu.gov.dm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DM",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DO",
    "name": "Central Bank of the Dominican Republic",
    "url": "http://www.bancentral.gov.do/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DO",
    "name": "Unidad de Analisis Financiero (UAF)",
    "url": "https://www.uaf.gob.do/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DO",
    "name": "Superintendencia de Bancos",
    "url": "http://www.sib.gob.do/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DZ",
    "name": "Bank of Algeria",
    "url": "http://www.bank-of-algeria.dz/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DZ",
    "name": "Financial Intelligence Processing nit (CTRF)",
    "url": "http://www.mf-ctrf.gov.dz/ngindex.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "DZ",
    "name": "Bank of Algeria",
    "url": "http://www.bank-of-algeria.dz/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EC",
    "name": "Central Bank of Ecuador",
    "url": "https://www.bce.fin.ec/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EC",
    "name": "Unidad de Analisis Financiero y Economico del Ecuador (UAFE)",
    "url": "http://www.uafe.gob.ec/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EC",
    "name": "Superintendencia de Bancos",
    "url": "http://www.superbancos.gob.ec/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EE",
    "name": "Bank of Estonia",
    "url": "http://www.eestipank.ee/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EE",
    "name": "Estonian Financial Intelligence Unit (Estonian FIU)",
    "url": "https://www.fiu.ee/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EE",
    "name": "Bank of Estonia",
    "url": "http://www.eestipank.ee/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EE",
    "name": "Estonian Financial Supervision Authority",
    "url": "http://www.fi.ee/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EG",
    "name": "Central Bank of Egypt",
    "url": "https://www.cbe.org.eg/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EG",
    "name": "Egyptian Money Laundering and Terrorist Financing Combating Unit (EMLCU)",
    "url": "https://www.mlcu.org.eg/ar/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "EG",
    "name": "Central Bank of Egypt",
    "url": "https://www.cbe.org.eg/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ER",
    "name": "Bank of Eritrea",
    "url": "https://www.fatf-gafi.org/content/dam/fatf-gafi/fsrb-mer/Eritrea-MER-2025.pdf.coredownload.inline.pdf",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "FATF_ASSESSMENT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ES",
    "name": "Bank of Spain",
    "url": "http://www.bde.es/homee.htm",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ES",
    "name": "Executive Service of the Commission for the Prevention of Money Laundering and Monetary Offences (SEPBLAC)",
    "url": "http://www.sepblac.es/ingles/acerca_sepblac/acercade.htm",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ES",
    "name": "Bank of Spain",
    "url": "http://www.bde.es/homee.htm",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ET",
    "name": "National Bank of Ethiopia",
    "url": "http://www.nbe.gov.et/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ET",
    "name": "Ethiopian Financial Intelligence Centre (EFIC)",
    "url": "http://www.fic.gov.et/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ET",
    "name": "National Bank of Ethiopia",
    "url": "http://www.nbe.gov.et/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FI",
    "name": "Bank of Finland",
    "url": "http://www.suomenpankki.fi/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FI",
    "name": "Financial Intelligence Unit (RAP)",
    "url": "https://vm.fi/en/prevention-of-money-laundering",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FI",
    "name": "Bank of Finland",
    "url": "http://www.suomenpankki.fi/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FI",
    "name": "Financial Supervisory Authority",
    "url": "http://www.fin-fsa.fi/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FJ",
    "name": "Reserve Bank of Fiji",
    "url": "http://www.rbf.gov.fj/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FJ",
    "name": "Fiji  Financial Intelligence Unit (Fiji-FIU)",
    "url": "http://www.fijifiu.gov.fj/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FJ",
    "name": "Reserve Bank of Fiji",
    "url": "http://www.rbf.gov.fj/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FR",
    "name": "Bank of France",
    "url": "https://www.banque-france.fr/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FR",
    "name": "Intelligence Processing and Action Against Illicit Financial networks Unit (TRACFIN)",
    "url": "http://www.economie.gouv.fr/tracfin/accueil-tracfin",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "FR",
    "name": "Autorité de Contrôle Prudentiel et de Résolution",
    "url": "https://acpr.banque-france.fr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "ACPR"
  },
  {
    "iso2": "GA",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GA",
    "name": "National Agency for Financial Investigation (ANIF)",
    "url": "http://www.anif.ga/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GB",
    "name": "Bank of England",
    "url": "http://www.bankofengland.co.uk/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GB",
    "name": "UK  Financial Intelligence Unit (UKFIU)",
    "url": "http://www.nationalcrimeagency.gov.uk/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GB",
    "name": "Bank of England",
    "url": "http://www.bankofengland.co.uk/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GB",
    "name": "The Financial Conduct Authority",
    "url": "http://www.fca.org.uk/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FCA"
  },
  {
    "iso2": "GD",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GD",
    "name": "Financial Intelligence Unit Grenada (FIU-Grenada)",
    "url": "http://www.grenadafiu.com/index.php/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GD",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GE",
    "name": "National Bank of Georgia",
    "url": "https://www.nbg.gov.ge/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GE",
    "name": "Financial Monitoring Service of Georgia (FFMS)",
    "url": "https://egmontgroup.org/en/content/bosnia-and-herzegovina-financial-intelligence-department",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GE",
    "name": "National Bank of Georgia",
    "url": "https://www.nbg.gov.ge/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GG",
    "name": "Financial Intelligence Service (FIS)",
    "url": "http://www.guernseyfiu.gov.gg/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GG",
    "name": "Guernsey Financial Services Commission",
    "url": "http://www.gfsc.gg/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "GFSC"
  },
  {
    "iso2": "GH",
    "name": "Bank of Ghana",
    "url": "http://www.bog.gov.gh/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GH",
    "name": "Financial Intelligence Centre Ghana (FIC)",
    "url": "http://fic.gov.gh/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GH",
    "name": "Bank of Ghana",
    "url": "http://www.bog.gov.gh/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GI",
    "name": "Gibraltar Financial Intelligence Unit (GCID GFIU)",
    "url": "http://gfiu.gov.gi/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GI",
    "name": "Financial Services Commission",
    "url": "http://www.fsc.gi/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GM",
    "name": "Central Bank of The Gambia",
    "url": "http://www.cbg.gm/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GM",
    "name": "Financial Intelligence Unit of The Gambia (FIA)",
    "url": "https://fiu.gov.gm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GM",
    "name": "Central Bank of The Gambia",
    "url": "http://www.cbg.gm/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GN",
    "name": "Central Bank of the Republic of Guinea",
    "url": "http://www.bcrg-guinee.org/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GN",
    "name": "Central Bank of the Republic of Guinea",
    "url": "http://www.bcrg-guinee.org/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GQ",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GQ",
    "name": "Agencia Nacional de Investigación Financiera (ANIF)",
    "url": "https://www.anif.gq/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GR",
    "name": "Bank of Greece",
    "url": "https://www.bankofgreece.gr/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GR",
    "name": "Unit A' of the Anti-Money Laundering Authority (Hellenic FIU)",
    "url": "http://www.hellenic-fiu.gr/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GR",
    "name": "Bank of Greece",
    "url": "https://www.bankofgreece.gr/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GT",
    "name": "Bank of Guatemala",
    "url": "http://www.banguat.gob.gt/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GT",
    "name": "Superintendencia de Bancos",
    "url": "http://www.sib.gob.gt/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GT",
    "name": "Superintendencia de Bancos",
    "url": "http://www.sib.gob.gt/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GU",
    "name": "Banking and Insurance Board",
    "url": "https://www.guamtax.com/bib/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GW",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GW",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GY",
    "name": "Bank of Guyana",
    "url": "http://www.bankofguyana.org.gy/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GY",
    "name": "Financial Intelligence Unit, Guyana",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "GY",
    "name": "Bank of Guyana",
    "url": "http://www.bankofguyana.org.gy/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HK",
    "name": "Hong Kong Monetary Authority",
    "url": "https://www.hkma.gov.hk/eng",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "HKMA"
  },
  {
    "iso2": "HK",
    "name": "Joint  Financial Intelligence Unit (JFIU)",
    "url": "http://www.jfiu.gov.hk/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HK",
    "name": "Hong Kong Monetary Authority",
    "url": "https://www.hkma.gov.hk/eng",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "HKMA"
  },
  {
    "iso2": "HN",
    "name": "Central Bank of Honduras",
    "url": "https://www.bch.hn/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HN",
    "name": "Unidad de Inteligencia Financiera (UIF-Honduras)",
    "url": "http://pplaft.cnbs.gob.hn/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HN",
    "name": "Central Bank of Honduras",
    "url": "https://www.bch.hn/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HN",
    "name": "Comisión Nacional de Bancos y Seguros",
    "url": "http://www.cnbs.gob.hn/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HR",
    "name": "Croatian National Bank",
    "url": "http://www.hnb.hr/home",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HR",
    "name": "Anti-Money Laundering Office – FIU Croatia (AMLO)",
    "url": "http://www.mfin.hr/en/anti-money-laundering-office",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HR",
    "name": "Croatian National Bank",
    "url": "http://www.hnb.hr/home",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HT",
    "name": "Bank of the Republic of Haiti",
    "url": "https://www.brh.ht/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HT",
    "name": "Bank of the Republic of Haiti",
    "url": "https://www.brh.ht/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HU",
    "name": "Central Bank of Hungary",
    "url": "http://english.mnb.hu/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HU",
    "name": "Hungarian  Financial Intelligence Unit (HFIU)",
    "url": "https://pei.nav.gov.hu/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "HU",
    "name": "Central Bank of Hungary",
    "url": "http://felugyelet.mnb.hu/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ID",
    "name": "Bank Indonesia",
    "url": "http://www.bi.go.id/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ID",
    "name": "Indonesian Financial Transaction Reports and Analysis Centre (PPATK)",
    "url": "http://www.ppatk.go.id/?reloaded=yes",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ID",
    "name": "Bank Indonesia",
    "url": "http://www.bi.go.id/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IE",
    "name": "Central Bank of Ireland",
    "url": "http://www.centralbank.ie/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBI"
  },
  {
    "iso2": "IE",
    "name": "Financial Intelligence Unit Ireland (FIU Ireland)",
    "url": "http://www.garda.ie/Controller.aspx?Page=29",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IE",
    "name": "Central Bank of Ireland",
    "url": "http://www.centralbank.ie/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBI"
  },
  {
    "iso2": "IL",
    "name": "Bank of Israel",
    "url": "https://www.boi.org.il/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IL",
    "name": "Israel Money Laundering and Terror Financing Prohibition Authority (IMPA)",
    "url": "http://www.justice.gov.il/En/Units/IMPA/Pages/Default.aspx",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IL",
    "name": "Bank of Israel",
    "url": "https://www.boi.org.il/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IM",
    "name": "Isle of Man  Financial Intelligence Unit (FIU-IOM)",
    "url": "http://www.fiu.im/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IM",
    "name": "Financial Supervision Commission",
    "url": "http://www.fsc.gov.im/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IN",
    "name": "Reserve Bank of India",
    "url": "http://www.rbi.org.in/home.aspx",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IN",
    "name": "Financial Intelligence Unit India (FIU-IND)",
    "url": "http://fiuindia.gov.in/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IN",
    "name": "Reserve Bank of India",
    "url": "http://www.rbi.org.in/home.aspx",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IQ",
    "name": "Central Bank of Iraq",
    "url": "https://cbi.iq/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IQ",
    "name": "Anti-Money Laundering and Countering Financing of Terrorism Office of Iraq",
    "url": "https://aml.iq/?lang=en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IR",
    "name": "The Central Bank of the Islamic Republic of Iran",
    "url": "http://www.cbi.ir/default_en.aspx",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IR",
    "name": "The Central Bank of the Islamic Republic of Iran",
    "url": "http://www.cbi.ir/default_en.aspx",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IS",
    "name": "Central Bank of Iceland",
    "url": "https://www.cb.is/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IS",
    "name": "Financial Intelligence Unit – Iceland (FIU-ICE)",
    "url": "https://www.government.is/topics/public-safety-and-security/aml-cft-policies/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IS",
    "name": "Central Bank of Iceland",
    "url": "https://www.cb.is/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IS",
    "name": "Financial Supervisory Authority of Iceland",
    "url": "http://en.fme.is/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IT",
    "name": "Bank of Italy",
    "url": "https://www.bancaditalia.it/homepage/index.html?com.dotmarketing.htmlpage.language=1",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IT",
    "name": "Bank of Italy",
    "url": "https://www.bancaditalia.it/homepage/index.html?com.dotmarketing.htmlpage.language=1",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "IT",
    "name": "Bank of Italy",
    "url": "https://www.bancaditalia.it/homepage/index.html?com.dotmarketing.htmlpage.language=1",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JE",
    "name": "Financial Intelligence Unit – Jersey",
    "url": "https://www.fiu.je/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JE",
    "name": "Jersey Financial Services Commission",
    "url": "http://www.jerseyfsc.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "JFSC"
  },
  {
    "iso2": "JM",
    "name": "Bank of Jamaica",
    "url": "http://www.boj.org.jm/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JM",
    "name": "Financial Investigations Division (FID)",
    "url": "http://fid.gov.jm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JM",
    "name": "Bank of Jamaica",
    "url": "http://www.boj.org.jm/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JO",
    "name": "Central Bank of Jordan",
    "url": "http://www.cbj.gov.jo/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JO",
    "name": "Anti-Money Laundering and Counter Terrorist Financing Unit (AMLU Jordan)",
    "url": "http://www.amlu.gov.jo/ar-jo/home.aspx",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JO",
    "name": "Central Bank of Jordan",
    "url": "http://www.cbj.gov.jo/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JP",
    "name": "Bank of Japan",
    "url": "http://www.boj.or.jp/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JP",
    "name": "Japan  Financial Intelligence Center (JAFIC)",
    "url": "http://www.npa.go.jp/sosikihanzai/jafic/index_e.htm",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JP",
    "name": "Bank of Japan",
    "url": "http://www.boj.or.jp/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "JP",
    "name": "Financial Services Agency",
    "url": "http://www.fsa.go.jp/en/index.html",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KE",
    "name": "Central Bank of Kenya",
    "url": "http://www.centralbank.go.ke/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KE",
    "name": "The Financial Reporting Centre (FRC) Kenya",
    "url": "https://www.cid.go.ke/index.php/sections/investigationunits/financial-investigations-unit-fiu.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KE",
    "name": "Central Bank of Kenya",
    "url": "http://www.centralbank.go.ke/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KG",
    "name": "National Bank of the Kyrgyz Republic",
    "url": "https://www.nbkr.kg/index.jsp?lang=eng",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KG",
    "name": "The State Financial Intelligence Under the Government of the Kyrgyz Republic (FIS)",
    "url": "http://www.fiu.gov.kg/en.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KG",
    "name": "National Bank of the Kyrgyz Republic",
    "url": "https://www.nbkr.kg/index.jsp?lang=eng",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KH",
    "name": "National Bank of Cambodia",
    "url": "https://www.nbc.org.kh/english/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KH",
    "name": "National Bank of Cambodia",
    "url": "https://www.nbc.org.kh/english/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KM",
    "name": "Banque Centrale des Comores",
    "url": "https://banque-comores.km/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KM",
    "name": "Banque Centrale des Comores",
    "url": "https://banque-comores.km/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KN",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KN",
    "name": "Financial Intelligence Unit Saint Kitts and Nevis (FIU-SKN)",
    "url": "https://www.fiu.kn/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KN",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KR",
    "name": "Bank of Korea",
    "url": "https://www.bok.or.kr/eng/main/main.do",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KR",
    "name": "Korea  Financial Intelligence Unit (KoFIU)",
    "url": "https://www.kofiu.go.kr/eng/main.do",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KR",
    "name": "Bank of Korea",
    "url": "https://www.bok.or.kr/eng/main/main.do",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KR",
    "name": "Financial Supervisory Service",
    "url": "http://english.fss.or.kr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FSS"
  },
  {
    "iso2": "KW",
    "name": "Central Bank of Kuwait",
    "url": "http://www.cbk.gov.kw/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KW",
    "name": "Kuwaiti Financial Intelligence Unit (KwFIU)",
    "url": "http://www.kwfiu.gov.kw/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KW",
    "name": "Central Bank of Kuwait",
    "url": "http://www.cbk.gov.kw/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KY",
    "name": "Cayman Islands Monetary Authority",
    "url": "http://www.cimoney.com.ky/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CIMA"
  },
  {
    "iso2": "KY",
    "name": "Financial Reporting Authority (FRA)",
    "url": "http://www.fra.gov.ky/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KY",
    "name": "Cayman Islands Monetary Authority",
    "url": "http://www.cimoney.com.ky/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CIMA"
  },
  {
    "iso2": "KZ",
    "name": "National Bank of Kazakhstan",
    "url": "https://nationalbank.kz/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KZ",
    "name": "Financial Monitoring Agency of the Republic of Kazakhstan",
    "url": "https://afmrk.gov.kz/en/index/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KZ",
    "name": "National Bank of Kazakhstan",
    "url": "https://nationalbank.kz/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "KZ",
    "name": "The Agency of the Republic of Kazakhstan for Regulation and Development of Financial Market",
    "url": "https://www.gov.kz/memleket/entities/ardfm?lang=en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LA",
    "name": "Bank of the Lao PDR",
    "url": "https://www.bol.gov.la/en/index",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LA",
    "name": "Anti-Money Laundering Intelligence Office of Lao PDR",
    "url": "http://amlio.gov.la/eng/about.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LB",
    "name": "Central Bank of Lebanon",
    "url": "http://www.bdl.gov.lb/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LB",
    "name": "Special Investigation Commission (SIC)",
    "url": "http://www.sic.gov.lb/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LB",
    "name": "Central Bank of Lebanon",
    "url": "http://www.bdl.gov.lb/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LC",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LC",
    "name": "Financial Intelligence Authority (FIA-Saint Lucia)",
    "url": "https://www.slufia.com/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LC",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LI",
    "name": "Financial Intelligence Unit Liechtenstein (EFFI)",
    "url": "http://www.fiu.li/index.php/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LI",
    "name": "Financial Market Authority",
    "url": "http://www.fma-li.li/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LK",
    "name": "Central Bank of Sri Lanka",
    "url": "http://www.cbsl.gov.lk/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LK",
    "name": "Financial Intelligence Unit of Sri Lanka (Sri Lanka FIU)",
    "url": "http://fiusrilanka.gov.lk/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LK",
    "name": "Central Bank of Sri Lanka",
    "url": "http://www.cbsl.gov.lk/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LR",
    "name": "Central Bank of Liberia",
    "url": "http://www.cbl.org.lr/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LR",
    "name": "Financial Intelligence Agency of Liberia\t(FIA-LIBERIA)",
    "url": "https://www.fialiberia.gov.lr/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LS",
    "name": "Central Bank of Lesotho",
    "url": "http://www.centralbank.org.ls/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LS",
    "name": "Financial Intelligence Unit of Lesotho",
    "url": "https://fiu.org.ls/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LS",
    "name": "Central Bank of Lesotho",
    "url": "http://www.centralbank.org.ls/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LT",
    "name": "Bank of Lithuania",
    "url": "https://www.lb.lt/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LT",
    "name": "Financial Crime Investigation Service Under the Ministry of Interior (FCIS)",
    "url": "http://www.fntt.lt/en.php/138",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LT",
    "name": "Bank of Lithuania",
    "url": "https://www.lb.lt/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LU",
    "name": "Central Bank of Luxembourg",
    "url": "https://www.bcl.lu/en/index.html",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LU",
    "name": "Financial Intelligence Unit (FIU-LUX)",
    "url": "http://www.crf.lu/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LU",
    "name": "Central Bank of Luxembourg",
    "url": "https://www.bcl.lu/en/index.html",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LU",
    "name": "Commission de Surveillance du Secteur Financier",
    "url": "http://www.cssf.lu/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CSSF"
  },
  {
    "iso2": "LV",
    "name": "Bank of Latvia",
    "url": "https://www.bank.lv/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LV",
    "name": "Financial Intelligence Unit of Latvia (FID)",
    "url": "https://www.fid.gov.lv/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LV",
    "name": "Financial and Capital Market Commission",
    "url": "http://www.fktk.lv/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LY",
    "name": "Central Bank of Libya",
    "url": "https://cbl.gov.ly/en/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "LY",
    "name": "Central Bank of Libya",
    "url": "https://cbl.gov.ly/en/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MA",
    "name": "Bank Al-Maghrib (Central Bank of Morocco)",
    "url": "http://www.bkam.ma/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MA",
    "name": "Financial Information Processing Unit (UTRF)",
    "url": "http://www.utrf.gov.ma/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MA",
    "name": "Bank Al-Maghrib (Central Bank of Morocco)",
    "url": "http://www.bkam.ma/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MC",
    "name": "Autorité Monégasque de Sécurité Financière (AMSF)",
    "url": "https://www.siccfin.mc/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MD",
    "name": "National Bank of Moldova",
    "url": "http://www.bnm.md/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MD",
    "name": "Office for Prevention and Fight Against Money Laundering (SPCSB)",
    "url": "http://spcsb.cna.md/about-us",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MD",
    "name": "National Bank of Moldova",
    "url": "http://www.bnm.md/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ME",
    "name": "Central Bank of Montenegro",
    "url": "https://www.cbcg.me/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ME",
    "name": "Department for the Prevention of Money Laundering and Terrorist Financing (DPMLTF)",
    "url": "http://www.foj.gov.me/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MG",
    "name": "Banky Foiben'i Madagasikara",
    "url": "https://www.banky-foibe.mg/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MG",
    "name": "The Financial Intelligent Unit (SAMIFIN)",
    "url": "https://www.samifin.gov.mg/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MG",
    "name": "Banky Foiben'i Madagasikara",
    "url": "https://www.banky-foibe.mg/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MH",
    "name": "Domestic  Financial Intelligence Unit (DFIU)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MK",
    "name": "National Bank of the Republic of North Macedonia",
    "url": "https://www.nbrm.mk/pocetna-en.nspx",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MK",
    "name": "Financial Intelligence Office (FIO)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MK",
    "name": "National Bank of the Republic of North Macedonia",
    "url": "https://www.nbrm.mk/pocetna-en.nspx",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ML",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ML",
    "name": "National Financial Intelligence Processing Unit (CENTIF-Mali)",
    "url": "http://www.centif.gov.ml/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ML",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MM",
    "name": "Central Bank of Myanmar",
    "url": "http://www.cbm.gov.mm/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MM",
    "name": "Central Bank of Myanmar",
    "url": "http://www.cbm.gov.mm/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MN",
    "name": "Bank of Mongolia",
    "url": "https://www.mongolbank.mn/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MN",
    "name": "Bank of Mongolia",
    "url": "https://www.mongolbank.mn/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MO",
    "name": "Monetary Authority of Macao",
    "url": "https://www.amcm.gov.mo/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MO",
    "name": "Financial Intelligence Office (GIF)",
    "url": "http://www.gif.gov.mo/web1/en_about.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MO",
    "name": "Monetary Authority of Macao",
    "url": "https://www.amcm.gov.mo/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MR",
    "name": "Banque Centrale de Mauritanie",
    "url": "https://www.bcm.mr/portail",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MR",
    "name": "Banque Centrale de Mauritanie",
    "url": "https://www.bcm.mr/portail",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MS",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MS",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MS",
    "name": "Financial Services Commission",
    "url": "http://www.fscmontserrat.org/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MT",
    "name": "Central Bank of Malta",
    "url": "http://www.centralbankmalta.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MT",
    "name": "Financial Intelligence Analysis Unit (FIAU)",
    "url": "https://fiaumalta.org/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MT",
    "name": "Central Bank of Malta",
    "url": "http://www.centralbankmalta.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MT",
    "name": "Malta Financial Services Authority",
    "url": "http://www.mfsa.com.mt/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "MFSA"
  },
  {
    "iso2": "MU",
    "name": "Bank of Mauritius",
    "url": "http://www.bom.mu/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MU",
    "name": "Financial Intelligence Unit Mauritius (FIU-Mauritius)",
    "url": "http://www.fiumauritius.org/English/Pages/default.aspx",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MU",
    "name": "Bank of Mauritius",
    "url": "http://www.bom.mu/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MV",
    "name": "Maldives Monetary Authority",
    "url": "http://www.mma.gov.mv/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MV",
    "name": "Maldives Monetary Authority",
    "url": "http://www.mma.gov.mv/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MV",
    "name": "Maldives Monetary Authority",
    "url": "http://www.mma.gov.mv/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MW",
    "name": "Reserve Bank of Malawi",
    "url": "https://www.rbm.mw/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MW",
    "name": "Financial Intelligence Authority Malawi (FIA-Malawi)",
    "url": "https://fia.gov.mw/index.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MW",
    "name": "Reserve Bank of Malawi",
    "url": "https://www.rbm.mw/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MX",
    "name": "Bank of Mexico",
    "url": "https://www.banxico.org.mx/indexen.html",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MX",
    "name": "Financial Intelligence Unit Mexico (FIU-Mexico)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MX",
    "name": "Comisión Nacional Bancaria y de Valores",
    "url": "http://www.cnbv.gob.mx/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CNBV"
  },
  {
    "iso2": "MY",
    "name": "Central Bank of Malaysia",
    "url": "http://www.bnm.gov.my/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MY",
    "name": "Financial Intelligence Unit Malaysia (UPWBNM)",
    "url": "http://amlcft.bnm.gov.my/AMLCFT02biii.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MY",
    "name": "Central Bank of Malaysia",
    "url": "http://www.bnm.gov.my/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MZ",
    "name": "Bank of Mozambique",
    "url": "http://www.bancomoc.mz/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MZ",
    "name": "Financial Intelligence Office of Mozambique (GiFiM)",
    "url": "https://www.gifim.gov.mz/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "MZ",
    "name": "Bank of Mozambique",
    "url": "http://www.bancomoc.mz/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NA",
    "name": "Bank of Namibia",
    "url": "http://www.bon.com.na/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NA",
    "name": "Financial Intelligence Centre (FIC)",
    "url": "https://www.fic.na/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NA",
    "name": "Bank of Namibia",
    "url": "http://www.bon.com.na/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NE",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NE",
    "name": "National Financial Intelligence and Processing unit of Niger (CENTIF)",
    "url": "http://www.finances.gouv.ne/index.php/responsables-du-ministere/a-b-c/centif",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NE",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NG",
    "name": "Central Bank of Nigeria",
    "url": "http://www.cbn.gov.ng/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBN"
  },
  {
    "iso2": "NG",
    "name": "Nigerian Financial Intelligence Unit (NFIU)",
    "url": "http://www.nfiu.gov.ng/index.php/nfiu",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NG",
    "name": "Central Bank of Nigeria",
    "url": "http://www.cbn.gov.ng/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "CBN"
  },
  {
    "iso2": "NG",
    "name": "Nigeria Deposit Insurance Corporation",
    "url": "http://www.ndic.gov.ng/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NI",
    "name": "Central Bank of Nicaragua",
    "url": "http://www.bcn.gob.ni/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NI",
    "name": "Superintendencia de Bancos y Otras Instituciones Financieras",
    "url": "http://www.siboif.gob.ni/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NL",
    "name": "De Nederlandsche Bank",
    "url": "https://www.dnb.nl/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "DNB"
  },
  {
    "iso2": "NL",
    "name": "Financial Intelligence Unit – Netherlands (FIU-NL)",
    "url": "http://www.fiu-nederland.nl/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NL",
    "name": "De Nederlandsche Bank",
    "url": "https://www.dnb.nl/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "DNB"
  },
  {
    "iso2": "NO",
    "name": "Central Bank of Norway",
    "url": "https://www.norges-bank.no/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NO",
    "name": "Financial Intelligence Unit Norway (EFE)",
    "url": "http://www.okokrim.no/in-english",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NO",
    "name": "Central Bank of Norway",
    "url": "https://www.norges-bank.no/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NO",
    "name": "Finanstilsynet (The Financial Supervisory Authority of Norway)",
    "url": "http://www.finanstilsynet.no/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NP",
    "name": "Central Bank of Nepal (Nepal Rastra Bank)",
    "url": "http://www.nrb.org.np/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NP",
    "name": "Central Bank of Nepal (Nepal Rastra Bank)",
    "url": "http://www.nrb.org.np/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NP",
    "name": "Central Bank of Nepal (Nepal Rastra Bank)",
    "url": "http://www.nrb.org.np/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NR",
    "name": "Financial Intelligence Unit of Nauru",
    "url": "https://justice.gov.nr/financial-intelligence-unit/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NU",
    "name": "Niue  Financial Intelligence Unit (Niue FIU)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NZ",
    "name": "Reserve Bank of New Zealand",
    "url": "http://www.rbnz.govt.nz/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NZ",
    "name": "New Zealand Police Financial Intelligence Unit (NZ-Police FIU)",
    "url": "http://www.police.govt.nz/advice/businesses-and-organisations/fiu",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "NZ",
    "name": "Reserve Bank of New Zealand",
    "url": "http://www.rbnz.govt.nz/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "OM",
    "name": "Central Bank of Oman",
    "url": "http://www.cbo.gov.om/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "OM",
    "name": "National Centre for Financial Information",
    "url": "https://www.fiu.gov.om/index.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "OM",
    "name": "Central Bank of Oman",
    "url": "http://www.cbo.gov.om/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PA",
    "name": "National Bank of Panama (Banco Nacional de Panamá)",
    "url": "https://www.banconal.com.pa/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PA",
    "name": "Financial Analysis Unit Panama (UAF-Panama)",
    "url": "http://www.uaf.gob.pa/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PA",
    "name": "National Bank of Panama (Banco Nacional de Panamá)",
    "url": "https://www.banconal.com.pa/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PA",
    "name": "Superintendency of Banks of the Republic of Panama",
    "url": "http://www.superbancos.gob.pa/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PE",
    "name": "Central Reserve Bank of Peru",
    "url": "http://www.bcrp.gob.pe/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PE",
    "name": "Superintendencia de Banca y Seguros",
    "url": "http://www.sbs.gob.pe/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PE",
    "name": "Superintendencia de Banca y Seguros",
    "url": "http://www.sbs.gob.pe/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PG",
    "name": "Bank of Papua New Guinea",
    "url": "http://www.bankpng.gov.pg/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PG",
    "name": "Bank of Papua New Guinea",
    "url": "http://www.bankpng.gov.pg/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PG",
    "name": "Bank of Papua New Guinea",
    "url": "http://www.bankpng.gov.pg/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PH",
    "name": "Central Bank of the Philippines (Bangko Sentral ng Pilipinas)",
    "url": "http://www.bsp.gov.ph/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PH",
    "name": "Anti-Money Laundering Council (AMLC)",
    "url": "http://www.amlc.gov.ph/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PH",
    "name": "Central Bank of the Philippines (Bangko Sentral ng Pilipinas)",
    "url": "http://www.bsp.gov.ph/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PK",
    "name": "State Bank of Pakistan",
    "url": "http://www.sbp.org.pk/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PK",
    "name": "FMU",
    "acronym": "FMU",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PK",
    "name": "State Bank of Pakistan",
    "url": "http://www.sbp.org.pk/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PL",
    "name": "Narodowy Bank Polski",
    "url": "https://nbp.pl/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PL",
    "name": "General Inspector of Financial Information (GIFI)",
    "url": "http://www.mf.gov.pl/en/ministry-of-finance/aml-ctf/contact",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PL",
    "name": "Narodowy Bank Polski",
    "url": "https://nbp.pl/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PL",
    "name": "Polish Financial Supervision Authority",
    "url": "http://www.knf.gov.pl/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PS",
    "name": "Palestine Monetary Authority",
    "url": "https://www.pma.ps/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PS",
    "name": "Financial Follow-up Unit (FFU)",
    "url": "http://www.ffu.ps/english.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PS",
    "name": "Palestine Monetary Authority",
    "url": "https://www.pma.ps/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PT",
    "name": "Banco de Portugal",
    "url": "https://www.bportugal.pt/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PT",
    "name": "Financial Intelligence Unit Portugal (UIF-Portugal)",
    "url": "https://www.policiajudiciaria.pt/PortalWeb/page/%7BE6E29429-8228-44A5-8338-9A3F3BCC3986%7D",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PT",
    "name": "Banco de Portugal",
    "url": "https://www.bportugal.pt/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PW",
    "name": "Financial Intelligence Unit",
    "url": "https://palaufiu.org/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PW",
    "name": "Financial Institutions Commission",
    "url": "https://ropfic.org/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PY",
    "name": "Central Bank of Paraguay",
    "url": "http://www.bcp.gov.py/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PY",
    "name": "Financial Intelligence Unit Paraguay (UAF-Seprelad)",
    "url": "https://www.seprelad.gov.py/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "PY",
    "name": "Central Bank of Paraguay",
    "url": "http://www.bcp.gov.py/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "QA",
    "name": "Qatar Central Bank",
    "url": "http://www.qcb.gov.qa/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "QA",
    "name": "Qatar Financial Information Unit (QFIU)",
    "url": "http://www.qfiu.gov.qa/index.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "QA",
    "name": "Qatar Central Bank",
    "url": "http://www.qcb.gov.qa/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "QA",
    "name": "Qatar Financial Centre Regulatory Authority",
    "url": "http://www.qfcra.com/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RO",
    "name": "National Bank of Romania",
    "url": "https://www.bnro.ro/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RO",
    "name": "National Office for Prevention and Control of Money Laundering (ONPCSB)",
    "url": "http://www.onpcsb.ro/html/english.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RO",
    "name": "National Bank of Romania",
    "url": "https://www.bnro.ro/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RS",
    "name": "National Bank of Serbia",
    "url": "https://nbs.rs/en/indeks/index.html",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RS",
    "name": "Administration for the Prevention of Money Laundering (APML)",
    "url": "http://www.apml.gov.rs/eng/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RS",
    "name": "National Bank of Serbia",
    "url": "https://nbs.rs/en/indeks/index.html",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RU",
    "name": "Central Bank of the Russian Federation",
    "url": "http://www.cbr.ru/eng/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RU",
    "name": "Federal Financial Monitoring Service (Rosfinmonitoring)",
    "url": "http://www.fedsfm.ru/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RU",
    "name": "Central Bank of the Russian Federation",
    "url": "http://www.cbr.ru/eng/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RW",
    "name": "National Bank of Rwanda",
    "url": "http://www.bnr.rw/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RW",
    "name": "The Financial Intelligence Unit (FIU) of the Republic of Rwanda (FIC)",
    "url": "https://www.fic.gov.rw/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "RW",
    "name": "National Bank of Rwanda",
    "url": "http://www.bnr.rw/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SA",
    "name": "Saudi Central Bank",
    "url": "https://www.sama.gov.sa/en-us",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SA",
    "name": "Saudi Arabia Financial Investigation Unit (SAFIU)",
    "url": "https://www.moi.gov.sa/wps/portal/Home/sectors/safiu",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SA",
    "name": "Saudi Central Bank",
    "url": "https://www.sama.gov.sa/en-us",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SB",
    "name": "Central Bank of Solomon Islands",
    "url": "https://www.cbsi.com.sb/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SB",
    "name": "Central Bank of Solomon Islands",
    "url": "https://www.cbsi.com.sb/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SB",
    "name": "Central Bank of Solomon Islands",
    "url": "https://www.cbsi.com.sb/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SC",
    "name": "Central Bank of Seychelles",
    "url": "http://www.cbs.sc/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SC",
    "name": "Seychelles  Financial Intelligence Unit (Seychelles FIU)",
    "url": "http://www.seychellesfiu.sc/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SC",
    "name": "Central Bank of Seychelles",
    "url": "http://www.cbs.sc/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SD",
    "name": "Bank of Sudan",
    "url": "http://www.cbos.gov.sd/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SD",
    "name": "Financial Information Unit (FIUSU)",
    "url": "http://www.fiu.gov.sd/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SD",
    "name": "Bank of Sudan",
    "url": "http://www.cbos.gov.sd/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SE",
    "name": "Sveriges Riksbank",
    "url": "https://www.riksbank.se/en-gb/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SE",
    "name": "Finansinspektionen",
    "url": "http://www.fi.se/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FISE"
  },
  {
    "iso2": "SE",
    "name": "Finansinspektionen",
    "url": "http://www.fi.se/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "FISE"
  },
  {
    "iso2": "SE",
    "name": "Sveriges Riksbank",
    "url": "https://www.riksbank.se/en-gb/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SG",
    "name": "Monetary Authority of Singapore",
    "url": "http://www.mas.gov.sg/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "MAS"
  },
  {
    "iso2": "SG",
    "name": "Suspicious Transaction Reporting Office (STRO)",
    "url": "https://www.police.gov.sg/Who-We-Are/Organisation-Structure/Specialist-Staff-Departments",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SG",
    "name": "Monetary Authority of Singapore",
    "url": "http://www.mas.gov.sg/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "MAS"
  },
  {
    "iso2": "SI",
    "name": "Banka Slovenije",
    "url": "http://www.bsi.si/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SI",
    "name": "Office for Money Laundering Prevention (OMLP)",
    "url": "http://www.uppd.gov.si/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SI",
    "name": "Banka Slovenije",
    "url": "http://www.bsi.si/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SK",
    "name": "National Bank of Slovakia",
    "url": "http://www.nbs.sk/en/home",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SK",
    "name": "Financial Intelligence Unit of the National Criminal Agency (FSJ)",
    "url": "http://www.minv.sk/?financna-policia",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SK",
    "name": "National Bank of Slovakia",
    "url": "http://www.nbs.sk/en/home",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SL",
    "name": "Bank of Sierra Leone",
    "url": "http://www.bsl.gov.sl/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SL",
    "name": "Financial Intelligence Unit Sierra Leone (FIA)",
    "url": "https://fiu.gov.sl/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SL",
    "name": "Bank of Sierra Leone",
    "url": "http://www.bsl.gov.sl/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SM",
    "name": "Central Bank of the Republic of San Marino",
    "url": "https://www.bcsm.sm/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SM",
    "name": "Financial Intelligence Agency (FIA San Marino)",
    "url": "http://www.aif.sm/site/en/home.html",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SM",
    "name": "Central Bank of the Republic of San Marino",
    "url": "https://www.bcsm.sm/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SN",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SN",
    "name": "National Financial Intelligence Processing Unit (CENTIF)",
    "url": "http://www.centif.sn/presentation_eng.php",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SN",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SO",
    "name": "Central Bank of Somalia",
    "url": "https://centralbank.gov.so/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SO",
    "name": "Central Bank of Somalia",
    "url": "https://centralbank.gov.so/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SR",
    "name": "Central Bank of Suriname",
    "url": "http://www.cbvs.sr/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SR",
    "name": "Financial Intelligence Unit Suriname (FIU-Suriname)",
    "url": "https://www.fiusuriname.org/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SR",
    "name": "Central Bank of Suriname",
    "url": "http://www.cbvs.sr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SS",
    "name": "Bank of South Sudan",
    "url": "https://boss.gov.ss/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SS",
    "name": "Bank of South Sudan",
    "url": "https://boss.gov.ss/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ST",
    "name": "Banco Central de São Tomé e Príncipe",
    "url": "https://bcstp.st/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ST",
    "name": "Banco Central de São Tomé e Príncipe",
    "url": "https://bcstp.st/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SV",
    "name": "Central Reserve Bank of El Salvador",
    "url": "http://www.bcr.gob.sv/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SV",
    "name": "Financial Investigation Unit El Salvador (UIF – El Salvador)",
    "url": "http://www.uif.gob.sv/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SV",
    "name": "Central Reserve Bank of El Salvador",
    "url": "http://www.bcr.gob.sv/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SV",
    "name": "Superintendencia del Sistema Financiero",
    "url": "http://www.ssf.gob.sv/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SX",
    "name": "Reporting Center for Unusual Transactions (MOT Sint Maarten)",
    "url": "http://www.fiu-sxm.net/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SY",
    "name": "Central Bank of Syria",
    "url": "https://cb.gov.sy/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SY",
    "name": "Combating Money Laundering and Terrorism Financing Commission (CMLC)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SY",
    "name": "Central Bank of Syria",
    "url": "https://cb.gov.sy/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SZ",
    "name": "The Central Bank of Eswatini",
    "url": "http://www.centralbank.org.sz/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SZ",
    "name": "Eswatini Financial Intelligence Centre (EFIC)",
    "url": "https://www.efic.org.sz/",
    "role": "fiu",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "SZ",
    "name": "The Central Bank of Eswatini",
    "url": "http://www.centralbank.org.sz/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TC",
    "name": "Financial Intelligence Agency of the Turks and Caicos Islands (FIA-TCI)",
    "url": "http://www.tcipolice.tc/index.php/financial-intelligence-unit/200-fiu-overview",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TC",
    "name": "Financial Services Commission",
    "url": "http://www.tcifsc.tc/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TD",
    "name": "Bank of Central African States",
    "url": "https://www.beac.int/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TD",
    "name": "Agence Nationale d Investigation Financiere du Tchad (ANIF)",
    "url": "https://anif-tchad.td/fr/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TG",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TG",
    "name": "Togo Financial Intelligence Unit (CENTIF Togo)",
    "url": "http://centif.tg/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TG",
    "name": "Central Bank of West African States (BCEAO)",
    "url": "https://www.bceao.int/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TH",
    "name": "Bank of Thailand",
    "url": "https://www.bot.or.th/english",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TH",
    "name": "Anti-Money Laundering Office Thailand (AMLO)",
    "url": "https://www.amlo.go.th/index.php/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TH",
    "name": "Bank of Thailand",
    "url": "https://www.bot.or.th/english",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TJ",
    "name": "National Bank of the Republic of Tajikistan",
    "url": "https://nbt.tj/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TJ",
    "name": "National Bank of the Republic of Tajikistan",
    "url": "https://nbt.tj/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TJ",
    "name": "National Bank of the Republic of Tajikistan",
    "url": "https://nbt.tj/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TL",
    "name": "UIF Timore-Leste",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TM",
    "name": "Central Bank of Turkmenistan",
    "url": "https://www.cbt.tm/en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TM",
    "name": "Financial Monitoring Service (FMS)",
    "url": "http://www.turkmenfmd.gov.tm/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TM",
    "name": "Central Bank of Turkmenistan",
    "url": "https://www.cbt.tm/en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TN",
    "name": "Central Bank of Tunisia",
    "url": "https://www.bct.gov.tn/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TN",
    "name": "Tunisian Financial Analysis Committee (CTAF)",
    "url": "http://www.ctaf.gov.tn/ctaf_f/eng/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TN",
    "name": "Central Bank of Tunisia",
    "url": "https://www.bct.gov.tn/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TO",
    "name": "National Reserve Bank of Tonga",
    "url": "http://www.reservebank.to/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TO",
    "name": "National Reserve Bank of Tonga",
    "url": "http://www.reservebank.to/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TR",
    "name": "Central Bank of the Republic of Türkiye",
    "url": "https://www.tcmb.gov.tr/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TR",
    "name": "Financial Crimes Investigation Board (MASAK)",
    "url": "http://www.masak.gov.tr/en/default",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TR",
    "name": "Banking Regulation and Supervision Agency",
    "url": "http://www.bddk.org.tr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TR",
    "name": "Central Bank of the Republic of Türkiye",
    "url": "https://www.tcmb.gov.tr/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TT",
    "name": "Central Bank of Trinidad and Tobago",
    "url": "http://www.central-bank.org.tt/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TT",
    "name": "Financial Intelligence Unit of Trinidad and Tobago (FIUTT)",
    "url": "http://www.fiu.gov.tt/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TT",
    "name": "Central Bank of Trinidad and Tobago",
    "url": "http://www.central-bank.org.tt/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TW",
    "name": "Anti-Money Laundering Division (AMLD)",
    "url": "http://www.mjib.gov.tw/en",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TZ",
    "name": "Bank of Tanzania",
    "url": "https://www.bot.go.tz/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TZ",
    "name": "Financial Intelligence Unit (FIU) - Tanzania",
    "url": "https://www.fiu.go.tz/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "TZ",
    "name": "Bank of Tanzania",
    "url": "https://www.bot.go.tz/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UA",
    "name": "National Bank of Ukraine",
    "url": "https://bank.gov.ua/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UA",
    "name": "The State Financial Monitoring Service of Ukraine (SFMS)",
    "url": "https://fiu.gov.ua/en/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UA",
    "name": "National Bank of Ukraine",
    "url": "https://bank.gov.ua/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UG",
    "name": "Bank of Uganda",
    "url": "http://www.bou.or.ug/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UG",
    "name": "Financial Intelligence Authority (FIA)",
    "url": "https://www.fia.go.ug/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UG",
    "name": "Bank of Uganda",
    "url": "http://www.bou.or.ug/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Board of Governors of the Federal Reserve System",
    "url": "http://www.federalreserve.gov/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Atlanta",
    "url": "http://www.frbatlanta.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Boston",
    "url": "https://www.bostonfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Chicago",
    "url": "http://www.chicagofed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Cleveland",
    "url": "http://www.clevelandfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Dallas",
    "url": "http://www.dallasfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Kansas City",
    "url": "http://www.kansascityfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Minneapolis",
    "url": "http://www.minneapolisfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of New York",
    "url": "http://www.newyorkfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Philadelphia",
    "url": "http://www.philadelphiafed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of Richmond",
    "url": "http://richmondfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of San Francisco",
    "url": "http://www.frbsf.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Reserve Bank of St Louis",
    "url": "http://www.stlouisfed.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Financial Crimes Enforcement Network (FinCEN)",
    "url": "https://www.fincen.gov/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": "FINCEN"
  },
  {
    "iso2": "US",
    "name": "Board of Governors of the Federal Reserve System",
    "url": "http://www.federalreserve.gov/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Federal Deposit Insurance Corporation DC",
    "url": "http://www.fdic.gov/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "New York State Department of Financial Services",
    "url": "http://www.dfs.ny.gov/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "US",
    "name": "Office of the Comptroller of the Currency",
    "url": "http://www.occ.treas.gov/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": "OCC"
  },
  {
    "iso2": "UY",
    "name": "Central Bank of Uruguay",
    "url": "https://www.bcu.gub.uy/ingles",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UY",
    "name": "Central Bank of Uruguay",
    "url": "https://www.bcu.gub.uy/ingles",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UY",
    "name": "Central Bank of Uruguay",
    "url": "https://www.bcu.gub.uy/ingles",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UZ",
    "name": "Central Bank of the Republic of Uzbekistan",
    "url": "https://cbu.uz/en/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UZ",
    "name": "Department on Struggle Against Tax Currency Crimes and Legalization of Criminal Incomes at the GPO (FIU-Uzbekistan)",
    "url": "http://prokuratura.uz/ru/#/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "UZ",
    "name": "Central Bank of the Republic of Uzbekistan",
    "url": "https://cbu.uz/en/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VA",
    "name": "Financial Information Authority (AIF)",
    "url": "https://www.aif.va/ENG/Home.aspx",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VC",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VC",
    "name": "Financial Intelligence Unit Saint Vincent and the Grenadines (FIU-SVG)",
    "url": "http://www.svgfiu.com/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VC",
    "name": "Eastern Caribbean Central Bank",
    "url": "http://www.eccb-centralbank.org/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VE",
    "name": "Central Bank of Venezuela",
    "url": "http://www.bcv.org.ve/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VE",
    "name": "Superintendencia de Bancos y Otras Instituciones Financieras",
    "url": "http://www.sudeban.gob.ve/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VE",
    "name": "Superintendencia de Bancos y Otras Instituciones Financieras",
    "url": "http://www.sudeban.gob.ve/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VG",
    "name": "Financial Investigation Agency British Virgin Islands (FIA)",
    "url": "http://fiabvi.vg/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VG",
    "name": "Financial Services Commission",
    "url": "http://www.bvifsc.vg/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VI",
    "name": "Office of the Lieutenant Governor — Division of Banking, Insurance and Financial Regulation",
    "url": "https://ltg.gov.vi/departments/banking-insurance-and-financial-regulation/",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "OFFICIAL_NATIONAL",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VN",
    "name": "State Bank of Vietnam",
    "url": "https://www.sbv.gov.vn/webcenter/portal/en",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VN",
    "name": "State Bank of Vietnam",
    "url": "https://www.sbv.gov.vn/webcenter/portal/en",
    "role": "prudential",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VU",
    "name": "Reserve Bank of Vanuatu",
    "url": "http://www.rbv.gov.vu/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VU",
    "name": "Vanuatu  Financial Intelligence Unit (FIU-Vanuatu)",
    "url": "http://fiu.gov.vu/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VU",
    "name": "Reserve Bank of Vanuatu",
    "url": "http://www.rbv.gov.vu/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "VU",
    "name": "Vanuatu Financial Services Commission",
    "url": "http://www.vfsc.vu/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "WS",
    "name": "Central Bank of Samoa",
    "url": "http://www.cbs.gov.ws/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "WS",
    "name": "Central Bank of Samoa",
    "url": "http://www.cbs.gov.ws/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "WS",
    "name": "Central Bank of Samoa",
    "url": "http://www.cbs.gov.ws/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "XK",
    "name": "Central Bank of the Republic of Kosovo",
    "url": "https://bqk-kos.org/?lang=en",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "XK",
    "name": "Financial Intelligence Unit of Kosovo (NJIF-K)",
    "url": "https://egmontgroup.org/members-by-region/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "XK",
    "name": "Central Bank of the Republic of Kosovo",
    "url": "https://bqk-kos.org/?lang=en",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "YE",
    "name": "Central Bank of Yemen",
    "url": "https://cby-ye.com/",
    "role": "central_bank",
    "egmontMember": false,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZA",
    "name": "South African Reserve Bank",
    "url": "http://www.resbank.co.za/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZA",
    "name": "Financial Intelligence Centre (FIC)",
    "url": "https://www.fic.gov.za/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZA",
    "name": "South African Reserve Bank",
    "url": "http://www.resbank.co.za/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZM",
    "name": "Bank of Zambia",
    "url": "https://www.boz.zm/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZM",
    "name": "Financial Intelligence Centre (FIC)",
    "url": "https://www.fic.gov.zm/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "EGMONT",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZM",
    "name": "Bank of Zambia",
    "url": "https://www.boz.zm/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZW",
    "name": "Reserve Bank of Zimbabwe",
    "url": "http://www.rbz.co.zw/",
    "role": "central_bank",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZW",
    "name": "Reserve Bank of Zimbabwe",
    "url": "http://www.rbz.co.zw/",
    "role": "fiu",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  },
  {
    "iso2": "ZW",
    "name": "Reserve Bank of Zimbabwe",
    "url": "http://www.rbz.co.zw/",
    "role": "prudential",
    "egmontMember": true,
    "grade": "A",
    "sourceId": "BIS",
    "regactionsRegulatorId": null
  }
];

// Legal instruments are keyed by the atlas's jurisdiction NAME (the atlas
// sheet does not carry ISO2); resolved to iso2 below via countries.ts name
// matching at module load, once, so pages key purely on iso2 like every
// other register table.
const JURISDICTION_NAME_TO_ISO2 = new Map<string, string>(
  COUNTRIES.map((c) => [c.name.toLowerCase(), c.iso2]),
);

function resolveJurisdictionNameToIso2(name: string): string | null {
  // countries.ts is the canonical name source; match case-insensitively on
  // the canonical name. Unmatched names are dropped (never fabricated).
  return JURISDICTION_NAME_TO_ISO2.get(name.toLowerCase()) ?? null;
}

const INSTRUMENTS_BY_NAME: Array<{
  jurisdictionName: string;
  category: string | null;
  title: string;
  status: string | null;
  grade: "A" | "B";
  url: string | null;
  refreshed: string | null;
}> = [
  {
    "jurisdictionName": "Angola",
    "category": "Core AML/CFT",
    "title": "Law No. 5/2020 on Prevention and Combating Money Laundering, Terrorist Financing and Proliferation Financing",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "B",
    "url": "https://www.fatf-gafi.org/content/dam/fatf-gafi/fsrb-mer/Angola-Mutual-Evaluation-Report-2023.pdf",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Anguilla",
    "category": "Core AML/CFT",
    "title": "AML/CFT Code",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.gov.ai/service/2022-revised-statutes-and-regulations",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Anguilla",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering and Terrorist Financing Regulations",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.gov.ai/service/2022-revised-statutes-and-regulations",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Anguilla",
    "category": "Core AML/CFT",
    "title": "Proceeds of Crime Act",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.gov.ai/service/2022-revised-statutes-and-regulations",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Aruba",
    "category": "Core AML/CFT",
    "title": "State Ordinance for the Prevention and Combating of Money Laundering and Terrorist Financing",
    "status": "Authoritative international/legal source checked; confirm latest national consolidation and sector rules before launch",
    "grade": "B",
    "url": "https://www.fatf-gafi.org/en/publications/Mutualevaluations/Mer-aruba-2022.html",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Azerbaijan",
    "category": "Core AML/CFT",
    "title": "Law on Prevention of Legalization of Criminally Obtained Funds or Other Property and Financing of Terrorism",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.cbar.az/law-195/law-no-767-iiiq?language=en",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Barbados",
    "category": "Core AML/CFT",
    "title": "Money Laundering and Financing of Terrorism (Prevention and Control) Act",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.fsc.gov.bb/aml-cft",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Belarus",
    "category": "Core AML/CFT",
    "title": "Law on Measures to Prevent Legalization of Proceeds of Crime, Financing of Terrorism and Proliferation Financing",
    "status": "Authoritative international/legal source checked; confirm latest national consolidation and sector rules before launch",
    "grade": "B",
    "url": "https://www.refworld.org/legal/legislation/natlegbod/2015/73944",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Benin",
    "category": "Core AML/CFT",
    "title": "Law No. 2024-01 of 20 February 2024 on AML/CFT/CPF",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://centif.bj/storage/documents/JOURNAL_OFFICIEL_LOI_2024-01_DU_20_FEVRIER_2024.pdf",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Bosnia and Herzegovina",
    "category": "Core AML/CFT",
    "title": "Law on Prevention of Money Laundering and Financing of Terrorist Activities (current consolidated framework - 2024 refresh required)",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://www.coe.int/en/web/moneyval/jurisdictions/bosnia",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Botswana",
    "category": "Core AML/CFT",
    "title": "Counter-Terrorism Act",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.finance.gov.bw/index.php?Itemid=159&id=39&option=com_content&view=article",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Botswana",
    "category": "Core AML/CFT",
    "title": "Financial Intelligence Act No. 2 of 2022",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.finance.gov.bw/index.php?Itemid=159&id=39&option=com_content&view=article",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Botswana",
    "category": "Core AML/CFT",
    "title": "Financial Intelligence Regulations 2022",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.finance.gov.bw/index.php?Itemid=159&id=39&option=com_content&view=article",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Botswana",
    "category": "Core AML/CFT",
    "title": "Proceeds and Instruments of Crime Act",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.finance.gov.bw/index.php?Itemid=159&id=39&option=com_content&view=article",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "China",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering Law of the PRC (revised 2024; effective 1 January 2025)",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://english.www.gov.cn/news/202411/09/content_WS672ef1efc6d0868f4e8ecc4b.html",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Côte d'Ivoire",
    "category": "Core AML/CFT",
    "title": "Decree No. 2024-216 on targeted financial sanctions",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.centif.ci/au-plan-national/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Côte d'Ivoire",
    "category": "Core AML/CFT",
    "title": "Ordinance No. 2022-237 on administrative AML/CFT/CPF sanctions",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.centif.ci/au-plan-national/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Côte d'Ivoire",
    "category": "Core AML/CFT",
    "title": "Ordinance No. 2023-875 of 23 November 2023 on AML/CFT/CPF",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.centif.ci/au-plan-national/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Democratic Republic of the Congo",
    "category": "Core AML/CFT",
    "title": "Law No. 22/068 of 27 December 2022 on AML/CFT/CPF",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://www.fatf-gafi.org/en/publications/Mutualevaluations.html",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Democratic Republic of the Congo",
    "category": "Core AML/CFT",
    "title": "Law No. 25/048 of 1 July 2025 amending/completing Law No. 22/068",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://www.fatf-gafi.org/en/publications/Mutualevaluations.html",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Djibouti",
    "category": "Core AML/CFT",
    "title": "Law No. 104/AN/24/9eme L amending the terrorist-financing law",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://banque-centrale.dj/les-lois/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Djibouti",
    "category": "Core AML/CFT",
    "title": "Law No. 106/AN/24/9eme L on AML/CFT/CPF",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://banque-centrale.dj/les-lois/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Djibouti",
    "category": "Core AML/CFT",
    "title": "Law No. 178/AN/25/9eme L - 2025 amendment to the AML/CFT/CPF framework",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://banque-centrale.dj/les-lois/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Ethiopia",
    "category": "Amendment",
    "title": "Prevention and Suppression of Money Laundering and Financing of Terrorism (Amendment) Proclamation No. 1387/2025",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://justice.gov.et/en/law/%E1%89%A0%E1%8B%88%E1%8A%95%E1%8C%80%E1%88%8D-%E1%8B%B5%E1%88%AD%E1%8C%8A%E1%89%B5-%E1%8B%A8%E1%89%B0%E1%8C%88%E1%8A%98-%E1%8C%88%E1%8A%95%E1%8B%98%E1%89%A5-%E1%8B%88%E1%8B%AD%E1%88%9D-%E1%8A%95-2/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Ethiopia",
    "category": "Core AML/CFT",
    "title": "Prevention and Suppression of Money Laundering and Financing of Terrorism Proclamation No. 780/2013",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://justice.gov.et/en/law/%E1%89%A0%E1%8B%88%E1%8A%95%E1%8C%80%E1%88%8D-%E1%8B%B5%E1%88%AD%E1%8C%8A%E1%89%B5-%E1%8B%A8%E1%89%B0%E1%8C%88%E1%8A%98-%E1%8C%88%E1%8A%95%E1%8B%98%E1%89%A5-%E1%8B%88%E1%8B%AD%E1%88%9D-%E1%8A%95-2/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Ghana",
    "category": "Core AML/CFT",
    "title": "AML/CFT Regulations and sector AML/CFT/CPF guidelines",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://ghalii.org/akn/gh/act/2020/1044/eng%402020-12-29",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Ghana",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering Act 2020 (Act 1044)",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://ghalii.org/akn/gh/act/2020/1044/eng%402020-12-29",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Jordan",
    "category": "Core AML/CFT",
    "title": "Anti Money Laundering and Counter Terrorist Financing Law No. 20 of 2021",
    "status": "National/official source checked; read with subsequent amendments, implementing measures and sector rules",
    "grade": "A",
    "url": "https://www.amlu.gov.jo/ebv4.0/root_storage/en/eb_list_page/01_law_no.(20)_of_2021_-_anti_money_laundering_and_counter_terrorist_financing_law.pdf",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Liberia",
    "category": "Core AML/CFT",
    "title": "AML/CFT regulations including STR and currency-transaction reporting",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.fialiberia.gov.lr/aml-cft-laws-regulations/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Liberia",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering and Terrorist Financing Act 2012",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.fialiberia.gov.lr/aml-cft-laws-regulations/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Liberia",
    "category": "Core AML/CFT",
    "title": "Financial Intelligence Unit Act 2012",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.fialiberia.gov.lr/aml-cft-laws-regulations/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Monaco",
    "category": "Core AML/CFT",
    "title": "Law No. 1.362 of 3 August 2009 on AML/CFT/CPF and corruption, consolidated and amended through 2026",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://legimonaco.mc/tnc/loi/2009/08-03-1.362",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "North Macedonia",
    "category": "Core AML/CFT",
    "title": "Law on Prevention of Money Laundering and Financing of Terrorism (2022)",
    "status": "In force / current status to be read with amendments",
    "grade": "B",
    "url": "https://www.coe.int/en/web/moneyval/jurisdictions/north-macedonia",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Rwanda",
    "category": "Core AML/CFT",
    "title": "Law No. 038/2021 amending the AML/CFT/CPF law",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.fic.gov.rw/updates/news-detail/understanding-crimes-and-sanctions-of-money-laundering-terrorism-financing-and-financing-of-proliferation-of-weapons-of-mass-destruction-and-related-crimes",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Rwanda",
    "category": "Core AML/CFT",
    "title": "Law No. 75/2019 of 29 January 2020 on Prevention and Punishment of ML/TF/PF, as amended by Law No. 038/2021",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.fic.gov.rw/updates/news-detail/understanding-crimes-and-sanctions-of-money-laundering-terrorism-financing-and-financing-of-proliferation-of-weapons-of-mass-destruction-and-related-crimes",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Senegal",
    "category": "Core AML/CFT",
    "title": "Law No. 2024-08 of 14 February 2024 on AML/CFT/CPF",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.centif.sn/reglementation/fr/reglnation",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Sierra Leone",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering and Combating of Financing of Terrorism and Financing of Proliferation of WMD Act 2024 (Act 4 of 2024)",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "B",
    "url": "https://sierralii.gov.sl/legislation/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "United Arab Emirates",
    "category": "Core AML/CFT",
    "title": "Cabinet Resolution No. 134 of 2025 - Executive Regulations",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.moj.gov.ae/en/laws-and-legislation/anti-money-laundering-and-ctf/anti-money-laundering-and-combatting-terrorism-financing-department.aspx",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "United Arab Emirates",
    "category": "Core AML/CFT",
    "title": "Cabinet Resolution No. 74 of 2020 on terrorist lists and UNSC resolutions",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.moj.gov.ae/en/laws-and-legislation/anti-money-laundering-and-ctf/anti-money-laundering-and-combatting-terrorism-financing-department.aspx",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "United Arab Emirates",
    "category": "Core AML/CFT",
    "title": "Federal Decree-Law No. 10 of 2025 on AML/CFT/CPF",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.moj.gov.ae/en/laws-and-legislation/anti-money-laundering-and-ctf/anti-money-laundering-and-combatting-terrorism-financing-department.aspx",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Vanuatu",
    "category": "Core AML/CFT",
    "title": "Anti-Money Laundering and Counter-Terrorism Financing Act No. 13 of 2014",
    "status": "Current framework / read with amendments and sector rules",
    "grade": "A",
    "url": "https://www.vfsc.vu/legislation/",
    "refreshed": "2 October 2026"
  },
  {
    "jurisdictionName": "Vanuatu",
    "category": "Core AML/CFT",
    "title": "Virtual Assets Service Providers Act No. 3 of 2025",
    "status": "In force / current status to be read with amendments",
    "grade": "A",
    "url": "https://www.vfsc.vu/legislation/",
    "refreshed": "2 October 2026"
  }
];

export const GLOBAL_REGISTER_INSTRUMENTS: RegisterLegalInstrument[] = INSTRUMENTS_BY_NAME.map((row) => ({
  iso2: resolveJurisdictionNameToIso2(row.jurisdictionName),
  category: row.category,
  title: row.title,
  status: row.status,
  grade: row.grade,
  url: row.url ?? "",
  refreshed: row.refreshed,
})).filter((r): r is RegisterLegalInstrument => !!r.iso2);

export function getAuthoritiesForCountry(iso2: string): RegisterAuthority[] {
  const upper = iso2.toUpperCase();
  return GLOBAL_REGISTER_AUTHORITIES.filter((a) => a.iso2 === upper);
}

export function getInstrumentsForCountry(iso2: string): RegisterLegalInstrument[] {
  const upper = iso2.toUpperCase();
  return GLOBAL_REGISTER_INSTRUMENTS.filter((i) => i.iso2 === upper);
}

export function getAuthorityByRole(iso2: string, role: RegisterAuthorityRole): RegisterAuthority | undefined {
  return getAuthoritiesForCountry(iso2).find((a) => a.role === role);
}

/** ISO2 codes of every country with at least one published authority row. */
export const REGISTER_COVERED_ISO2: string[] = [...new Set(GLOBAL_REGISTER_AUTHORITIES.map((a) => a.iso2))].sort();
