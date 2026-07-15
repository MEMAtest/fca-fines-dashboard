-- Official-source verification for the four SEC actions held in the amount
-- review queue. Values represent the monetary relief stated in the linked SEC
-- publication; contextual investor losses, restitution and headline totals are
-- not added a second time.

INSERT INTO public.regulatory_amount_overrides (
  regulator,
  evidence_url,
  amount_original,
  currency,
  amount_gbp,
  amount_eur,
  verification_url,
  reason,
  quality_status,
  verified_at
)
VALUES
  (
    'SEC',
    public.normalise_regulatory_evidence_url('https://www.sec.gov/litigation/complaints/2022/comp-pr2022-84.pdf'),
    1024200000,
    'USD',
    798876000,
    942264000,
    'https://www.sec.gov/newsroom/press-releases/2022-84',
    'The SEC release records USD 315.2 million in disgorgement, USD 34 million in prejudgment interest and a USD 675 million civil penalty. The prior value also included more than USD 5 billion of separate victim restitution.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'SEC',
    public.normalise_regulatory_evidence_url('https://www.sec.gov/newsroom/press-releases/2024-73'),
    4678148502,
    'USD',
    3648955831.56,
    4303896621.84,
    'https://www.sec.gov/newsroom/press-releases/2024-73',
    'Verified against the SEC release, which itemises Terraform and Do Kwon monetary relief totalling USD 4,678,148,502 across disgorgement, prejudgment interest and civil penalties.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'SEC',
    public.normalise_regulatory_evidence_url('https://www.investor.gov/additional-resources/news-alerts/alerts-bulletins/investor-alert-ponzi-schemes-targeting-seniors'),
    1012600000,
    'USD',
    789828000,
    931592000,
    'https://www.sec.gov/newsroom/press-releases/2019-3',
    'The SEC release itemises USD 892 million in Woodbridge disgorgement and USD 120.6 million in monetary relief against Robert Shapiro. The prior value double-counted the rounded USD 1 billion headline.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  ),
  (
    'SEC',
    public.normalise_regulatory_evidence_url('https://www.sec.gov/litigation/admin/2018/33-10561.pdf'),
    1786000000,
    'USD',
    1393080000,
    1643120000,
    'https://www.sec.gov/newsroom/press-releases/2018-215',
    'Verified against the SEC release, which records USD 933 million in disgorgement and prejudgment interest plus a USD 853 million penalty.',
    'verified_override',
    '2026-07-15T00:00:00Z'
  )
ON CONFLICT (regulator, evidence_url) DO UPDATE SET
  amount_original = EXCLUDED.amount_original,
  currency = EXCLUDED.currency,
  amount_gbp = EXCLUDED.amount_gbp,
  amount_eur = EXCLUDED.amount_eur,
  verification_url = EXCLUDED.verification_url,
  reason = EXCLUDED.reason,
  quality_status = EXCLUDED.quality_status,
  verified_at = EXCLUDED.verified_at,
  updated_at = now();

REFRESH MATERIALIZED VIEW public.all_regulatory_fines_canonical;
