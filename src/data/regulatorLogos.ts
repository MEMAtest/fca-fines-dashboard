export type RegulatorMarkSurface = "light" | "dark" | "print";
export type RegulatorMarkSize = "small" | "medium" | "large";

export interface RegulatorPalette {
  ink: string;
  surface: string;
  ring: string;
}

export interface OfficialRegulatorLogoAsset {
  assetPath: string;
  sourceUrl: string;
  sourceType:
    | "official-site"
    | "media-kit"
    | "press-page"
    | "community-mirror";
  backgroundMode: "transparent" | "light-box-required";
  approvedForDarkUi: boolean;
  approvedForPrint: boolean;
  lastReviewedAt: string;
}

export interface OfficialRegulatorLogo extends OfficialRegulatorLogoAsset {
  compactLogo?: OfficialRegulatorLogoAsset;
}

export interface RegulatorLogoConfig {
  palette: RegulatorPalette;
  officialLogo?: OfficialRegulatorLogo;
}

const DEFAULT_PALETTE: RegulatorPalette = {
  ink: "#1f2937",
  surface: "#e5e7eb",
  ring: "#cbd5e1",
};

const REGULATOR_PALETTES: Record<string, RegulatorPalette> = {
  FCA: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  BAFIN: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  AMF: { ink: "#6b21a8", surface: "#f3e8ff", ring: "#d8b4fe" },
  CNMV: { ink: "#a16207", surface: "#fef3c7", ring: "#fcd34d" },
  CBI: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  SFC: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  AFM: { ink: "#c2410c", surface: "#ffedd5", ring: "#fdba74" },
  DNB: { ink: "#9a3412", surface: "#fed7aa", ring: "#fb923c" },
  ESMA: { ink: "#1e3a8a", surface: "#dbeafe", ring: "#93c5fd" },
  ECB: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#60a5fa" },
  DFSA: { ink: "#9a3412", surface: "#ffedd5", ring: "#fdba74" },
  FSRA: { ink: "#92400e", surface: "#fef3c7", ring: "#fbbf24" },
  CBUAE: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  JFSC: { ink: "#334155", surface: "#e2e8f0", ring: "#cbd5e1" },
  GFSC: { ink: "#4338ca", surface: "#e0e7ff", ring: "#a5b4fc" },
  CIRO: { ink: "#7c2d12", surface: "#ffedd5", ring: "#fdba74" },
  SEC: { ink: "#1e3a8a", surface: "#dbeafe", ring: "#93c5fd" },
  SEBI: { ink: "#9f1239", surface: "#ffe4e6", ring: "#fda4af" },
  HKMA: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  ASIC: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  AUSTRAC: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  MAS: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  OCC: { ink: "#4338ca", surface: "#e0e7ff", ring: "#a5b4fc" },
  FINCEN: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  FINMA: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  SESC: { ink: "#9f1239", surface: "#ffe4e6", ring: "#fda4af" },
  FSCA: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  FMANZ: { ink: "#0369a1", surface: "#e0f2fe", ring: "#7dd3fc" },
  CSRC: { ink: "#b91c1c", surface: "#fee2e2", ring: "#fca5a5" },
  FDIC: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  FRB: { ink: "#312e81", surface: "#e0e7ff", ring: "#a5b4fc" },
  CMASA: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  TWFSC: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  CVM: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  CNBV: { ink: "#065f46", surface: "#d1fae5", ring: "#6ee7b7" },
  CMF: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  OSC: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  CONSOB: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  BDI: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  ACPR: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  CSSF: { ink: "#7c2d12", surface: "#ffedd5", ring: "#fdba74" },
  FSMA: { ink: "#92400e", surface: "#fef3c7", ring: "#fbbf24" },
  FMAAT: { ink: "#b91c1c", surface: "#fee2e2", ring: "#fca5a5" },
  CNBCZ: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  CMVM: { ink: "#991b1b", surface: "#fee2e2", ring: "#fca5a5" },
  BDP: { ink: "#a16207", surface: "#fef3c7", ring: "#fcd34d" },
  CYSEC: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  FISE: { ink: "#0f766e", surface: "#ccfbf1", ring: "#5eead4" },
  FTDK: { ink: "#9a3412", surface: "#ffedd5", ring: "#fdba74" },
  FINFSA: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  FTNO: { ink: "#1e40af", surface: "#dbeafe", ring: "#93c5fd" },
  MFSA: { ink: "#7c3aed", surface: "#ede9fe", ring: "#c4b5fd" },
  IVASS: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  FINRA: { ink: "#1e3a8a", surface: "#dbeafe", ring: "#93c5fd" },
  SC: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
  "FSC-KR": { ink: "#b91c1c", surface: "#fee2e2", ring: "#fca5a5" },
  CIMA: { ink: "#7c2d12", surface: "#ffedd5", ring: "#fdba74" },
  BMA: { ink: "#1d4ed8", surface: "#dbeafe", ring: "#93c5fd" },
  CBN: { ink: "#166534", surface: "#dcfce7", ring: "#86efac" },
};

export const OFFICIAL_REGULATOR_LOGOS: Partial<
  Record<string, OfficialRegulatorLogo>
> = {
  FCA: {
    assetPath: "/regulator-logos/fca.ico",
    sourceUrl: "https://www.fca.org.uk/themes/custom/fca/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  BAFIN: {
    assetPath: "/regulator-logos/bafin.ico",
    sourceUrl:
      "https://www.bafin.de/SiteGlobals/Frontend/Images/favicon.ico?__blob=normal&v=6",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  AMF: {
    assetPath: "/regulator-logos/amf.ico",
    sourceUrl: "https://www.amf-france.org/themes/amf/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CNMV: {
    assetPath: "/regulator-logos/cnmv.svg",
    sourceUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/CNMV_logo.svg",
    sourceType: "community-mirror",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CBI: {
    assetPath: "/regulator-logos/cbi.ico",
    sourceUrl: "https://www.centralbank.ie/Theme/css/imgs/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  SFC: {
    assetPath: "/regulator-logos/sfc.png",
    sourceUrl: "https://www.sfc.hk/assets/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  AFM: {
    assetPath: "/regulator-logos/afm.png",
    sourceUrl: "https://www.afm.nl/images/global/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  DNB: {
    assetPath: "/regulator-logos/dnb.svg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/De_Nederlandsche_Bank_logo.svg",
    sourceType: "community-mirror",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/dnb-compact.svg",
      sourceUrl: "https://www.dnb.nl/Assets/favicons/favicon.svg",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  ESMA: {
    assetPath: "/regulator-logos/esma.ico",
    sourceUrl:
      "https://www.esma.europa.eu/themes/custom/esma_webst_theme/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  ECB: {
    assetPath: "/regulator-logos/ecb.svg",
    sourceUrl:
      "https://www.bankingsupervision.europa.eu/shared/img/logo/logo_only.svg",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  DFSA: {
    assetPath: "/regulator-logos/dfsa.png",
    sourceUrl:
      "https://www.dfsa.ae/application/files/5215/7831/7647/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FSRA: {
    assetPath: "/regulator-logos/fsra.png",
    sourceUrl: "https://www.adgm.com/Adgm/images/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CBUAE: {
    assetPath: "/regulator-logos/cbuae.png",
    sourceUrl:
      "https://en.wikipedia.org/wiki/Special:Redirect/file/UAE_Central_Bank_Logo.png",
    sourceType: "community-mirror",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/cbuae-compact.png",
      sourceUrl:
        "https://en.wikipedia.org/wiki/Special:Redirect/file/UAE_Central_Bank_Logo.png",
      sourceType: "community-mirror",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  JFSC: {
    assetPath: "/regulator-logos/jfsc.png",
    sourceUrl: "https://www.jerseyfsc.org/images/touch-icon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  GFSC: {
    assetPath: "/regulator-logos/gfsc.svg",
    sourceUrl: "https://www.gfsc.gg/themes/custom/gfsc_theme/logo.svg?v1.1",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CIRO: {
    assetPath: "/regulator-logos/ciro.png",
    sourceUrl:
      "https://www.ciro.ca/sites/default/files/images/2023-05/ciro-logo-file-White-Notice-EN-Tr.png",
    sourceType: "official-site",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/ciro-compact.png",
      sourceUrl:
        "https://www.ciro.ca/sites/default/files/images/2023-05/ciro-logo-file-White-Notice-EN-Tr.png",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  SEC: {
    assetPath: "/regulator-logos/sec.svg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Seal_of_the_United_States_Securities_and_Exchange_Commission.svg",
    sourceType: "community-mirror",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  SEBI: {
    assetPath: "/regulator-logos/sebi.png",
    sourceUrl: "https://www.sebi.gov.in/images/icons/sebi-icon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  TWFSC: {
    assetPath: "/regulator-logos/twfsc.ico",
    sourceUrl: "https://www.fsc.gov.tw/en/images/all/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CVM: {
    assetPath: "/regulator-logos/cvm.png",
    sourceUrl: "https://dados.cvm.gov.br/images/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CNBV: {
    assetPath: "/regulator-logos/cnbv.png",
    sourceUrl: "https://framework-gb.cdn.gob.mx/applications/cms/favicon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CMF: {
    assetPath: "/regulator-logos/cmf.svg",
    sourceUrl:
      "https://www.cmfchile.cl/portal/principal/613/channels-515_cmf_logo_nav.svg",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/cmf-compact.svg",
      sourceUrl:
        "https://www.cmfchile.cl/portal/principal/613/channels-515_cmf_logo_nav.svg",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  HKMA: {
    assetPath: "/regulator-logos/hkma.jpg",
    sourceUrl: "https://www.hkma.gov.hk/favicon.jpg",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  ASIC: {
    assetPath: "/regulator-logos/asic.svg",
    sourceUrl: "https://download.asic.gov.au/asic-nextgen/img/asic-logo.svg",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/asic-compact.ico",
      sourceUrl: "https://download.asic.gov.au/media/favicon.ico?v=1",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  AUSTRAC: {
    assetPath: "/regulator-logos/austrac.svg",
    sourceUrl: "https://www.austrac.gov.au/news-and-media/media-release",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  MAS: {
    assetPath: "/regulator-logos/mas.png",
    sourceUrl: "https://www.mas.gov.sg/html/site/_favicon/apple-touch-icon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  OCC: {
    assetPath: "/regulator-logos/occ-seal.gif",
    sourceUrl: "https://www.occ.treas.gov/images/occ-seal.gif",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FINCEN: {
    assetPath: "/regulator-logos/fincen.ico",
    sourceUrl: "https://www.fincen.gov/themes/custom/fincen/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-13",
  },
  FINMA: {
    assetPath: "/regulator-logos/finma.png",
    sourceUrl:
      "https://www.finma.ch/Frontend/Finma/assets/img/icon/apple-touch-icon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  SESC: {
    assetPath: "/regulator-logos/sesc.png",
    sourceUrl: "https://www.fsa.go.jp/images/icon.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FSCA: {
    assetPath: "/regulator-logos/fsca.png",
    sourceUrl: "https://www.fsca.co.za/fsca-logo-removebg-preview.png",
    sourceType: "official-site",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/fsca-compact.png",
      sourceUrl: "https://www.fsca.co.za/favicon.png",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  FMANZ: {
    assetPath: "/regulator-logos/fmanz.svg",
    sourceUrl:
      "https://www.fma.govt.nz/_resources/themes/fma3/images/FMA_Horizontal_RGB_SVG.svg?m=1775060963",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/fmanz-compact.ico",
      sourceUrl: "https://www.fma.govt.nz/assets/Uploads/favicon.ico",
      sourceType: "official-site",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  CSRC: {
    assetPath: "/regulator-logos/csrc.png",
    sourceUrl: "https://www.csrc.gov.cn/csrc/xhtml/images/public/footer_logo.png",
    sourceType: "official-site",
    backgroundMode: "light-box-required",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FDIC: {
    assetPath: "/regulator-logos/fdic.png",
    sourceUrl: "https://www.fdic.gov/system/files/2025-03/fdic-seal.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FRB: {
    assetPath: "/regulator-logos/frb.svg",
    sourceUrl: "https://www.federalreserve.gov/css/icons.data.svg.css",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CMASA: {
    assetPath: "/regulator-logos/cmasa.svg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Saudi_Capital_Market_Authority_Logo.svg",
    sourceType: "community-mirror",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
    compactLogo: {
      assetPath: "/regulator-logos/cmasa-compact.svg",
      sourceUrl:
        "https://commons.wikimedia.org/wiki/Special:Redirect/file/Saudi_Capital_Market_Authority_Logo.svg",
      sourceType: "community-mirror",
      backgroundMode: "transparent",
      approvedForDarkUi: true,
      approvedForPrint: true,
      lastReviewedAt: "2026-04-03",
    },
  },
  OSC: {
    assetPath: "/regulator-logos/osc.png",
    sourceUrl: "https://www.osc.ca/themes/custom/osc_glider/192x192.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CONSOB: {
    assetPath: "/regulator-logos/consob.ico",
    sourceUrl: "https://www.consob.it/o/classic-theme/images/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  BDI: {
    assetPath: "/regulator-logos/bdi.ico",
    sourceUrl: "https://www.bancaditalia.it/homepage/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  ACPR: {
    assetPath: "/regulator-logos/acpr.ico",
    sourceUrl:
      "https://acpr.banque-france.fr/sites/bdf_espaces2/themes/custom/bdf_acpr/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CSSF: {
    assetPath: "/regulator-logos/cssf.png",
    sourceUrl: "https://www.cssf.lu/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FSMA: {
    assetPath: "/regulator-logos/fsma.png",
    sourceUrl:
      "https://www.fsma.be/themes/custom/fsma/public/images/favicons/favicon-32x32.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FMAAT: {
    assetPath: "/regulator-logos/fmaat.ico",
    sourceUrl: "https://www.fma.gv.at/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CNBCZ: {
    assetPath: "/regulator-logos/cnbcz.png",
    sourceUrl:
      "https://www.cnb.cz/export/system/modules/org.opencms.apollo/resources/img/favicon_120.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CMVM: {
    assetPath: "/regulator-logos/cmvm.jpg",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/CMVM-Logo%C2%A6%C3%BCtipo-2199PX.jpg",
    sourceType: "community-mirror",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  BDP: {
    assetPath: "/regulator-logos/bdp.svg",
    sourceUrl: "https://www.bportugal.pt/themes/custom/bportugal/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  CYSEC: {
    assetPath: "/regulator-logos/cysec.ico",
    sourceUrl: "https://www.cysec.gov.cy/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FISE: {
    assetPath: "/regulator-logos/fise.ico",
    sourceUrl: "https://www.fi.se/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FTDK: {
    assetPath: "/regulator-logos/ftdk.svg",
    sourceUrl:
      "https://cdn.finanstilsynet.dk/finanstilsynet/Media/638204279936716910/footer-crown-2.svg",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FINFSA: {
    assetPath: "/regulator-logos/finfsa.ico",
    sourceUrl: "https://www.finanssivalvonta.fi/static/favicon/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FTNO: {
    assetPath: "/regulator-logos/ftno.png",
    sourceUrl: "https://www.finanstilsynet.no/Content/Favicons/favicon-32x32.png",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  MFSA: {
    assetPath: "/regulator-logos/mfsa.png",
    sourceUrl: "https://www.mfsa.mt/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  IVASS: {
    assetPath: "/regulator-logos/ivass.png",
    sourceUrl: "https://www.ivass.it/favicon.ico",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-03",
  },
  FINRA: {
    assetPath: "/regulator-logos/finra.svg",
    sourceUrl: "https://www.finra.org/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  SC: {
    assetPath: "/regulator-logos/sc.svg",
    sourceUrl: "https://www.sc.com.my/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  "FSC-KR": {
    assetPath: "/regulator-logos/fsc-kr.svg",
    sourceUrl: "https://www.fsc.go.kr/eng/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  CIMA: {
    assetPath: "/regulator-logos/cima.svg",
    sourceUrl: "https://www.cima.ky/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  BMA: {
    assetPath: "/regulator-logos/bma.svg",
    sourceUrl: "https://www.bma.bm/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
  CBN: {
    assetPath: "/regulator-logos/cbn.svg",
    sourceUrl: "https://www.cbn.gov.ng/",
    sourceType: "official-site",
    backgroundMode: "transparent",
    approvedForDarkUi: true,
    approvedForPrint: true,
    lastReviewedAt: "2026-04-07",
  },
};

export function normalizeRegulatorCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildRegulatorMonogram(code: string) {
  const compact = normalizeRegulatorCode(code).replace(/[^A-Z0-9]/g, "");
  return compact.slice(0, compact.length > 4 ? 3 : 4) || "REG";
}

export function getRegulatorSigilVariant(code: string) {
  const normalized = normalizeRegulatorCode(code);
  let hash = 0;

  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) % 5;
  }

  return hash;
}

export function getRegulatorPalette(code: string): RegulatorPalette {
  return REGULATOR_PALETTES[normalizeRegulatorCode(code)] ?? DEFAULT_PALETTE;
}

export function getOfficialRegulatorLogo(code: string) {
  return OFFICIAL_REGULATOR_LOGOS[normalizeRegulatorCode(code)] ?? null;
}

export function hasOfficialRegulatorLogo(code: string) {
  return Boolean(getOfficialRegulatorLogo(code));
}

export function isOfficialLogoApprovedForSurface(
  logo: OfficialRegulatorLogoAsset,
  surface: RegulatorMarkSurface,
) {
  if (surface === "dark") {
    return logo.approvedForDarkUi;
  }

  if (surface === "print") {
    return logo.approvedForPrint;
  }

  return true;
}

export function getRenderableOfficialRegulatorLogo(
  code: string,
  surface: RegulatorMarkSurface = "light",
  size: RegulatorMarkSize = "medium",
) {
  const logo = getOfficialRegulatorLogo(code);
  if (!logo) {
    return null;
  }

  const preferredLogo =
    size === "small" && logo.compactLogo ? logo.compactLogo : logo;

  if (isOfficialLogoApprovedForSurface(preferredLogo, surface)) {
    return preferredLogo;
  }

  return isOfficialLogoApprovedForSurface(logo, surface) ? logo : null;
}

export function getRegulatorLogoConfig(code: string): RegulatorLogoConfig {
  return {
    palette: getRegulatorPalette(code),
    officialLogo: getOfficialRegulatorLogo(code) ?? undefined,
  };
}
