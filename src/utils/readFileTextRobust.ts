function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFileAsTextOnce(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(reader.error || new Error('FileReader error'));
    };
    reader.readAsText(file);
  });
}

export async function readFileTextRobust(
  file: File,
  opts?: { retries?: number; retryDelayMs?: number }
): Promise<string> {
  const retries = opts?.retries ?? 1;
  const retryDelayMs = opts?.retryDelayMs ?? 200;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let text = await readFileAsTextOnce(file);

      if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
      }

      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError || new Error('Failed to read file');
}
