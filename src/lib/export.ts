/**
 * Turn an array of records into a CSV file and trigger a real browser download.
 * Columns are inferred from the first row's keys unless `columns` is given.
 */
export function downloadCsv<T extends object>(
  filename: string,
  rows: T[],
  columns?: (keyof T)[],
) {
  const keys = columns ?? (rows.length ? (Object.keys(rows[0]) as (keyof T)[]) : []);

  const escape = (value: unknown) => {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = keys.map((k) => escape(String(k))).join(",");
  const body = rows.map((row) => keys.map((k) => escape(row[k])).join(",")).join("\n");
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse a simple CSV string into an array of records keyed by the header row.
 * Handles quoted fields containing commas, escaped quotes ("") and CRLF. Not a
 * full RFC parser, but sufficient for the export/import round-trip in this app.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((c) => c !== "")) rows.push(row);
  }

  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((key, idx) => (rec[key] = (r[idx] ?? "").trim()));
    return rec;
  });
}

/**
 * Name/position that sign off a printed report, plus the date the signature is
 * dated. Rendered as a signature block beneath the table (see printReport).
 */
export interface ReportSignatory {
  name: string;
  position: string;
  /** ISO `YYYY-MM-DD`; shown above the signature line. */
  date?: string;
}

/**
 * Letterhead shown above a printed report — the agency the report was filtered
 * to, with its logo when one has been uploaded (see Settings → Agencies).
 */
export interface ReportBrand {
  /** Agency name, printed beside the logo. */
  name: string;
  /** Logo as a data URL. Ignored unless it is an inline `data:image/…` URL. */
  logo?: string;
}

/**
 * Only inline image data URLs are allowed as a logo `src`.
 *
 * The value reaches us from the stored agency record and is interpolated into
 * raw HTML, so a crafted `javascript:` or `data:text/html` value would execute
 * in the print window. Agency logos are always read via FileReader into a
 * `data:image/*` URL, so anything else is rejected rather than rendered.
 */
const safeLogoSrc = (logo: string | undefined): string | null =>
  logo && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(logo)
    ? logo
    : null;

/**
 * Open a printable HTML view of a tabular report in a new window and trigger
 * the print dialog — doubles as the "export to PDF" path (print → Save as PDF).
 * Columns are inferred from the first row's keys unless `columns` is given.
 * `totals` appends a bold summary row; `signatory` appends a signature block;
 * `brand` prints an agency letterhead above the title.
 * Returns false when the popup was blocked so callers can surface a hint.
 */
export function printReport(
  title: string,
  rows: Record<string, unknown>[],
  opts?: {
    subtitle?: string;
    columns?: string[];
    /** Bold footer row keyed by column name (e.g. a "TOTAL" line). */
    totals?: Record<string, unknown>;
    /** Signature block rendered under the table (NET 15 / NET 15-30 printouts). */
    signatory?: ReportSignatory;
    /** Agency letterhead (logo + name) printed above the report title. */
    brand?: ReportBrand;
  },
): boolean {
  const cols = opts?.columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
    .join("");

  const foot = opts?.totals
    ? `<tfoot><tr>${cols.map((c) => `<td>${esc(opts.totals![c] ?? "")}</td>`).join("")}</tr></tfoot>`
    : "";

  const meta = [opts?.subtitle, `${new Date().toLocaleDateString()}`, `${rows.length} rows`]
    .filter(Boolean)
    .join(" · ");

  // Signature block: date line, then the signatory's name over a rule with
  // their position beneath — the layout the finance team signs off on.
  const sig = opts?.signatory
    ? `<div class="sig">
        ${opts.signatory.date ? `<p class="sig-date">Date: ${esc(opts.signatory.date)}</p>` : ""}
        <p class="sig-name">${esc(opts.signatory.name)}</p>
        <p class="sig-pos">${esc(opts.signatory.position)}</p>
      </div>`
    : "";

  // Agency letterhead. The logo is only emitted when it is a genuine inline
  // image data URL; a named agency with no logo still prints its name, so the
  // reader can always tell which agency the figures belong to.
  const logoSrc = safeLogoSrc(opts?.brand?.logo);
  const brand = opts?.brand
    ? `<div class="brand">
        ${logoSrc ? `<img class="brand-logo" src="${logoSrc}" alt="">` : ""}
        <span class="brand-name">${esc(opts.brand.name)}</span>
      </div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:32px}
      h1{font-size:20px;margin:0 0 4px}
      p{color:#64748b;margin:0 0 20px;font-size:13px}
      .brand{display:flex;align-items:center;gap:12px;padding-bottom:14px;margin-bottom:16px;
        border-bottom:2px solid #0f172a}
      .brand-logo{height:44px;width:auto;max-width:180px;object-fit:contain}
      .brand-name{font-size:15px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;white-space:nowrap}
      th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#475569}
      tbody tr:nth-child(even) td{background:#f8fafc}
      tfoot td{background:#f1f5f9;font-weight:700}
      .sig{margin-top:48px;break-inside:avoid}
      .sig p{margin:0;color:#0f172a}
      .sig-date{color:#64748b !important;font-size:12px;margin-bottom:28px !important}
      .sig-name{display:inline-block;border-top:1px solid #0f172a;padding-top:6px;
        font-size:13px;font-weight:600;text-transform:uppercase;min-width:260px}
      .sig-pos{font-size:11px;color:#475569 !important;text-transform:uppercase;letter-spacing:.04em}
      @page{size:landscape}
    </style></head><body>
    ${brand}
    <h1>${esc(title)}</h1>
    <p>${esc(meta)}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
    ${sig}
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
