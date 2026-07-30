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
 * Open a printable HTML view of a tabular report in a new window and trigger
 * the print dialog — doubles as the "export to PDF" path (print → Save as PDF).
 * Columns are inferred from the first row's keys unless `columns` is given.
 * Returns false when the popup was blocked so callers can surface a hint.
 */
export function printReport(
  title: string,
  rows: Record<string, unknown>[],
  opts?: { subtitle?: string; columns?: string[] },
): boolean {
  const cols = opts?.columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
    .join("");

  const meta = [opts?.subtitle, `${new Date().toLocaleDateString()}`, `${rows.length} rows`]
    .filter(Boolean)
    .join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:32px}
      h1{font-size:20px;margin:0 0 4px}
      p{color:#64748b;margin:0 0 20px;font-size:13px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;white-space:nowrap}
      th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:.04em;color:#475569}
      tr:nth-child(even) td{background:#f8fafc}
      @page{size:landscape}
    </style></head><body>
    <h1>${esc(title)}</h1>
    <p>${esc(meta)}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
