import { Link } from "react-router-dom";
import { useSEO } from "../hooks/useSEO.js";

const containerStyle = {
  minHeight: "60vh",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  textAlign: "center" as const,
};

const bodyStyle = {
  color: "#64748b",
  marginBottom: "1.5rem",
  maxWidth: "560px",
};

const linkStyle = {
  color: "var(--primary-500, #3b82f6)",
  textDecoration: "underline",
};

export function NotFound() {
  useSEO({
    title: "Page Not Found | Regulatory Fines",
    description:
      "The page you were looking for could not be found on Regulatory Fines.",
    canonicalPath: "/404",
    ogType: "website",
  });

  return (
    <div style={containerStyle}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
        Page not found
      </h1>
      <p style={bodyStyle}>
        The page you requested does not exist, or the regulator code in the URL
        is invalid.
      </p>
      <Link to="/" style={linkStyle}>
        Return to homepage
      </Link>
    </div>
  );
}
