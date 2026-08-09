export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const text = item.str.trim();
      if (!text) continue;

      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 8) {
        lines.push('\n');
      }
      lines.push(text);
      lastY = y;
    }

    pages.push(lines.join(' ').replace(/ \n /g, '\n').replace(/\n{3,}/g, '\n\n'));
  }

  return pages.join('\n\n---\n\n');
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const paragraphs = escaped.split(/\n{2,}/);
  const htmlParts: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (trimmed === '---') {
      htmlParts.push('<hr />');
      continue;
    }

    const isShortLine = trimmed.length < 60 && !trimmed.includes('. ');
    if (isShortLine) {
      htmlParts.push(`<h3>${trimmed}</h3>`);
    } else {
      const withBreaks = trimmed.replace(/\n/g, '<br />');
      htmlParts.push(`<p>${withBreaks}</p>`);
    }
  }

  return htmlParts.join('\n');
}
