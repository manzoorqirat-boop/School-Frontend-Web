import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Mobile export: write content to a cache file, then open the OS share sheet
// (WhatsApp, email, Files, AirDrop…). Replaces the web app's download-blob flow.

function csvEscape(v: any): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  return head + '\n' + body;
}

async function shareFile(filename: string, content: string, mime: string) {
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename, UTI: mime === 'text/csv' ? 'public.comma-separated-values-text' : 'public.html' });
}

export async function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  await shareFile(filename.endsWith('.csv') ? filename : filename + '.csv', toCSV(headers, rows), 'text/csv');
}

// Simple printable HTML — opens in the share sheet; user can "Save to PDF" from
// the OS print/share dialog. Keeps us off a heavy native PDF dependency.
export async function exportHTML(filename: string, title: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #0F172A; }
  h1 { color: #6D3CF0; font-size: 22px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { background: #6D3CF0; color: #fff; text-align: left; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #E2E8F0; }
  tr:nth-child(even) td { background: #F6F7FB; }
</style></head><body><h1>${title}</h1>${bodyHtml}</body></html>`;
  await shareFile(filename.endsWith('.html') ? filename : filename + '.html', html, 'text/html');
}

export function htmlTable(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
  const body = rows.map(r => '<tr>' + r.map(c => `<td>${c ?? ''}</td>`).join('') + '</tr>').join('');
  return `<table>${head}${body}</table>`;
}
