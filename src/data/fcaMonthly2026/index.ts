// Monthly "FCA Fines <Month> 2026" series, one module per month.
// Order here is the order they are spliced into the blog catalogue.
// NO React/JSX imports here.

import type { BlogArticleMeta } from "../blogArticles.js";
import { fcaFinesApril2026 } from "./april.js";
import { fcaFinesMay2026 } from "./may.js";
import { fcaFinesJune2026 } from "./june.js";
import { fcaFinesJuly2026 } from "./july.js";
import { fcaFinesAugust2026 } from "./august.js";
import { fcaFinesSeptember2026 } from "./september.js";
import { fcaFinesOctober2026 } from "./october.js";

// Newest month first so equal publication dates list the latest tracker first.
export const fcaMonthly2026Articles: BlogArticleMeta[] = [
  fcaFinesOctober2026,
  fcaFinesSeptember2026,
  fcaFinesAugust2026,
  fcaFinesJuly2026,
  fcaFinesJune2026,
  fcaFinesMay2026,
  fcaFinesApril2026,
];
