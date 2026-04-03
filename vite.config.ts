import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function vendorManualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
    return 'vendor-react';
  }

  if (id.includes('/lucide-react/')) {
    return 'vendor-icons';
  }

  if (id.includes('/pdfjs-dist/')) {
    return 'vendor-pdf';
  }

  if (
    id.includes('/bpmn-js/') ||
    id.includes('/diagram-js/') ||
    id.includes('/bpmn-moddle/') ||
    id.includes('/moddle/') ||
    id.includes('/moddle-xml/') ||
    id.includes('/tiny-svg/') ||
    id.includes('/min-dash/')
  ) {
    return 'vendor-bpmn';
  }

  if (id.includes('/jszip/')) {
    return 'vendor-zip';
  }

  return 'vendor-misc';
}

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react', 'jszip'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorManualChunks,
      },
    },
  },
});
