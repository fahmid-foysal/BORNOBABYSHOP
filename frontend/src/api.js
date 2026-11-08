const base = import.meta.env.VITE_API_BASE_URL || "/api";
export async function api(path, options = {}) {
  const token = sessionStorage.getItem("bbs-token");
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options = { ...options, body: JSON.stringify(options.body) };
  }
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "The server returned an unexpected response" }));
  if (response.status === 401 && path !== "/auth/login") {
    sessionStorage.removeItem("bbs-token");
    window.dispatchEvent(new Event("bbs-logout"));
  }
  if (!response.ok) throw new Error(body.message || "Request failed");
  return body.data;
}
export const qs = (values) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) p.set(k, v);
  });
  return p.toString();
};
export const money = (n) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);
export const number = (n) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: 3 }).format(
    Number(n) || 0,
  );
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
export const defaultDates = () => ({
  from: `${today().slice(0, 7)}-01`,
  to: today(),
});
export const asset = (path) =>
  path?.startsWith("/uploads/")
    ? base.startsWith("http")
      ? new URL(base).origin + path
      : path
    : path;
export function downloadCsv(rows, name) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const cell = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  const csv =
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadXlsx(rows, name, sheetName = "Report") {
  if (!rows.length) return;
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const keys = Object.keys(rows[0]);
  worksheet.columns = keys.map((key) => ({
    header: key.replaceAll("_", " "),
    key,
    width: Math.min(40, Math.max(12, key.length + 3)),
  }));
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadPdf(rows, name, title = "Report") {
  if (!rows.length) return;
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const keys = Object.keys(rows[0]);
  const doc = new jsPDF({ orientation: keys.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  autoTableModule.default(doc, {
    startY: 20,
    head: [keys.map((key) => key.replaceAll("_", " "))],
    body: rows.map((row) => keys.map((key) => String(row[key] ?? ""))),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [14, 143, 146] },
  });
  doc.save(name);
}
