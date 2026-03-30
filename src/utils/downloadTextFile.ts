export function downloadTextFile(params: {
  filename: string;
  content: string;
  mimeType?: string;
}): void {
  const blob = new Blob([params.content], { type: params.mimeType ?? 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
