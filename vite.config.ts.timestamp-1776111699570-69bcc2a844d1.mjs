// vite.config.ts
import { defineConfig } from "file:///home/project/node_modules/vite/dist/node/index.js";
import react from "file:///home/project/node_modules/@vitejs/plugin-react/dist/index.mjs";
function vendorManualChunks(id) {
  if (!id.includes("node_modules")) return void 0;
  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
    return "vendor-react";
  }
  if (id.includes("/lucide-react/")) {
    return "vendor-icons";
  }
  if (id.includes("/pdfjs-dist/")) {
    return "vendor-pdf";
  }
  if (id.includes("/bpmn-js/") || id.includes("/diagram-js/") || id.includes("/bpmn-moddle/") || id.includes("/moddle/") || id.includes("/moddle-xml/") || id.includes("/tiny-svg/") || id.includes("/min-dash/")) {
    return "vendor-bpmn";
  }
  if (id.includes("/jszip/")) {
    return "vendor-zip";
  }
  return "vendor-misc";
}
var vite_config_default = defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["react", "react-dom", "lucide-react", "jszip"]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorManualChunks
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9wcm9qZWN0XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvaG9tZS9wcm9qZWN0L3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9ob21lL3Byb2plY3Qvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5cbmZ1bmN0aW9uIHZlbmRvck1hbnVhbENodW5rcyhpZDogc3RyaW5nKSB7XG4gIGlmICghaWQuaW5jbHVkZXMoJ25vZGVfbW9kdWxlcycpKSByZXR1cm4gdW5kZWZpbmVkO1xuXG4gIGlmIChpZC5pbmNsdWRlcygnL3JlYWN0LycpIHx8IGlkLmluY2x1ZGVzKCcvcmVhY3QtZG9tLycpIHx8IGlkLmluY2x1ZGVzKCcvc2NoZWR1bGVyLycpKSB7XG4gICAgcmV0dXJuICd2ZW5kb3ItcmVhY3QnO1xuICB9XG5cbiAgaWYgKGlkLmluY2x1ZGVzKCcvbHVjaWRlLXJlYWN0LycpKSB7XG4gICAgcmV0dXJuICd2ZW5kb3ItaWNvbnMnO1xuICB9XG5cbiAgaWYgKGlkLmluY2x1ZGVzKCcvcGRmanMtZGlzdC8nKSkge1xuICAgIHJldHVybiAndmVuZG9yLXBkZic7XG4gIH1cblxuICBpZiAoXG4gICAgaWQuaW5jbHVkZXMoJy9icG1uLWpzLycpIHx8XG4gICAgaWQuaW5jbHVkZXMoJy9kaWFncmFtLWpzLycpIHx8XG4gICAgaWQuaW5jbHVkZXMoJy9icG1uLW1vZGRsZS8nKSB8fFxuICAgIGlkLmluY2x1ZGVzKCcvbW9kZGxlLycpIHx8XG4gICAgaWQuaW5jbHVkZXMoJy9tb2RkbGUteG1sLycpIHx8XG4gICAgaWQuaW5jbHVkZXMoJy90aW55LXN2Zy8nKSB8fFxuICAgIGlkLmluY2x1ZGVzKCcvbWluLWRhc2gvJylcbiAgKSB7XG4gICAgcmV0dXJuICd2ZW5kb3ItYnBtbic7XG4gIH1cblxuICBpZiAoaWQuaW5jbHVkZXMoJy9qc3ppcC8nKSkge1xuICAgIHJldHVybiAndmVuZG9yLXppcCc7XG4gIH1cblxuICByZXR1cm4gJ3ZlbmRvci1taXNjJztcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbJ3JlYWN0JywgJ3JlYWN0LWRvbScsICdsdWNpZGUtcmVhY3QnLCAnanN6aXAnXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB2ZW5kb3JNYW51YWxDaHVua3MsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeU4sU0FBUyxvQkFBb0I7QUFDdFAsT0FBTyxXQUFXO0FBRWxCLFNBQVMsbUJBQW1CLElBQVk7QUFDdEMsTUFBSSxDQUFDLEdBQUcsU0FBUyxjQUFjLEVBQUcsUUFBTztBQUV6QyxNQUFJLEdBQUcsU0FBUyxTQUFTLEtBQUssR0FBRyxTQUFTLGFBQWEsS0FBSyxHQUFHLFNBQVMsYUFBYSxHQUFHO0FBQ3RGLFdBQU87QUFBQSxFQUNUO0FBRUEsTUFBSSxHQUFHLFNBQVMsZ0JBQWdCLEdBQUc7QUFDakMsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFJLEdBQUcsU0FBUyxjQUFjLEdBQUc7QUFDL0IsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUNFLEdBQUcsU0FBUyxXQUFXLEtBQ3ZCLEdBQUcsU0FBUyxjQUFjLEtBQzFCLEdBQUcsU0FBUyxlQUFlLEtBQzNCLEdBQUcsU0FBUyxVQUFVLEtBQ3RCLEdBQUcsU0FBUyxjQUFjLEtBQzFCLEdBQUcsU0FBUyxZQUFZLEtBQ3hCLEdBQUcsU0FBUyxZQUFZLEdBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1Q7QUFFQSxNQUFJLEdBQUcsU0FBUyxTQUFTLEdBQUc7QUFDMUIsV0FBTztBQUFBLEVBQ1Q7QUFFQSxTQUFPO0FBQ1Q7QUFFQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLFNBQVMsYUFBYSxnQkFBZ0IsT0FBTztBQUFBLEVBQ3pEO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixjQUFjO0FBQUEsTUFDaEI7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
