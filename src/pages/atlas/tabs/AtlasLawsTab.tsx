import { useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";

export function AtlasLawsTab() {
  const { country, instruments } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  return (
    <section className="atlas-card">
      <h3>Laws & regulations</h3>
      {instruments.length === 0 ? (
        <p className="atlas-empty">Not yet mapped — source check pending.</p>
      ) : (
        <table className="atlas-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Grade</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((i) => (
              <tr key={i.title}>
                <td>{i.title}</td>
                <td>{i.category ?? "—"}</td>
                <td>{i.status ?? "—"}</td>
                <td>{i.grade}</td>
                <td>
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noopener noreferrer">
                      Source
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
