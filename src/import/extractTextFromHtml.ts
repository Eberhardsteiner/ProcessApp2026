export interface HtmlExtractResult {
  text: string;
  warnings: string[];
}

function htmlToText(innerHTML: string): string {
  return innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTextFromHtml(html: string): HtmlExtractResult {
  const warnings: string[] = [];

  const doc = new DOMParser().parseFromString(html, 'text/html');

  let root: Element | null = null;
  let usedBody = false;

  root = doc.querySelector('#main-content');
  if (!root) root = doc.querySelector('#content');
  if (!root) root = doc.querySelector('article');
  if (!root) root = doc.querySelector('main');

  if (!root) {
    if (doc.body) {
      root = doc.body;
      usedBody = true;
    } else {
      warnings.push('Kein <body> gefunden, gesamtes Dokument wird verarbeitet.');
      const wrapper = doc.documentElement;
      root = wrapper;
    }
  }

  root.querySelectorAll('script,style,noscript').forEach((n) => n.remove());

  const text = htmlToText(root.innerHTML);

  if (usedBody) {
    warnings.push('Hauptinhalt nicht erkannt; gesamter Body wurde verwendet.');
  }

  if (text.length < 200) {
    warnings.push('HTML konnte nur sehr wenig Text extrahieren (evtl. Export enthält hauptsächlich Navigation/Wrapper).');
  }

  return { text, warnings };
}
