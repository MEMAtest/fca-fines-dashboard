-- Clean up duplicate notice_url rows in uk_enforcement_actions.
-- For each group sharing a notice_url, keep the most informative row
-- (prefer: non-null amount_original, then oldest created_at).
DELETE FROM uk_enforcement_actions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY notice_url
        ORDER BY
          (amount_original IS NOT NULL) DESC,
          created_at ASC
      ) AS rn
    FROM uk_enforcement_actions
    WHERE notice_url IS NOT NULL AND notice_url <> ''
  ) ranked
  WHERE rn > 1
);

-- Enforce notice_url uniqueness for rows that have one.
-- The partial predicate mirrors the ON CONFLICT clause in the upsert code.
CREATE UNIQUE INDEX IF NOT EXISTS uk_enforcement_notice_url_idx
  ON uk_enforcement_actions (notice_url)
  WHERE notice_url IS NOT NULL AND notice_url <> '';
