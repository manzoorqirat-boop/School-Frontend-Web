import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Export/share helper.
//
// Native: write to the cache dir, then open the OS share sheet (WhatsApp,
// email, Files, AirDrop…).
//
// Web: expo-file-system and expo-sharing have NO web implementation —
// FileSystem.cacheDirectory is null and writeAsStringAsync throws, so every
// export on the web build failed with an opaque error (or, where the caller
// swallowed it, did nothing at all). On web we build a Blob and trigger a real
// browser download instead, which is what a desktop user expects anyway.

function csvEscape(v: any): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  return head + '\n' + body;
}

function downloadInBrowser(filename: string, content: string, mime: string) {
  // A BOM makes Excel open UTF-8 CSV with the right encoding (matters for the
  // Hindi name columns this app exports).
  const blob = new Blob([mime === 'text/csv' ? '\ufeff' + content : content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on a later tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareFile(filename: string, content: string, mime: string) {
  if (Platform.OS === 'web') { downloadInBrowser(filename, content, mime); return; }

  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: mime,
    dialogTitle: filename,
    UTI: mime === 'text/csv' ? 'public.comma-separated-values-text' : 'public.html',
  });
}

export async function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  await shareFile(filename.endsWith('.csv') ? filename : filename + '.csv', toCSV(headers, rows), 'text/csv');
}

// Simple printable HTML — on native it opens in the share sheet ("Save to PDF"
// from the OS print dialog); on web it downloads and can be opened & printed.
// Keeps us off a heavy native PDF dependency.
export async function exportHTML(filename: string, title: string, bodyHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #0F172A; }
  h1 { color: #6D3CF0; font-size: 22px; }
  h2 { color: #6D3CF0; font-size: 16px; margin-top: 20px; }
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
