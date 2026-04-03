import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const assetsDir = join(process.cwd(), 'dist', 'assets');

try {
  const files = readdirSync(assetsDir)
    .filter((file) => /\.(js|css|mjs)$/i.test(file))
    .map((file) => {
      const fullPath = join(assetsDir, file);
      return {
        file,
        size: statSync(fullPath).size,
      };
    })
    .sort((a, b) => b.size - a.size);

  if (files.length === 0) {
    console.log('Keine Build-Artefakte in dist/assets gefunden. Bitte zuerst `npm run build` ausführen.');
    process.exit(0);
  }

  const formatSize = (value) => `${(value / 1024).toFixed(1)} kB`;
  const total = files.reduce((sum, file) => sum + file.size, 0);

  console.log('Bundle-Zusammenfassung');
  console.log('====================');
  console.log(`Assets gesamt: ${files.length}`);
  console.log(`Gesamtgröße:   ${formatSize(total)}`);
  console.log('');
  console.log('Größte Assets:');

  files.slice(0, 12).forEach((file, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}. ${file.file.padEnd(42)} ${formatSize(file.size)}`);
  });
} catch (error) {
  console.error('Bundle-Zusammenfassung konnte nicht gelesen werden. Bitte zuerst `npm run build` ausführen.');
  if (error instanceof Error) {
    console.error(error.message);
  }
  process.exit(1);
}
