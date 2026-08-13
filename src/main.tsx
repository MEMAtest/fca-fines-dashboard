import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./router.js";
import { Analytics } from "@vercel/analytics/react";
import "./styles/index.css";
import { isSensitiveAnalyticsPath } from "./utils/analyticsPath.js";

const analyticsAllowed = !isSensitiveAnalyticsPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppRouter />
    {analyticsAllowed ? <Analytics /> : null}
  </React.StrictMode>,
);
