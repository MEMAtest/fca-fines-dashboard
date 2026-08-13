import "dotenv/config";
import { getSqlClient } from "../../server/db.js";

const sql = getSqlClient();
try {
  await sql(`DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fca_app') THEN
      GRANT SELECT, INSERT, UPDATE ON public.email_digest_outbox TO fca_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_digest_deliveries TO fca_app;
    END IF;
  END
  $$`);
  console.log("Email digest dispatcher permissions are ready.");
} finally {
  await sql.end();
}
