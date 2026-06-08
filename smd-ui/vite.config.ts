import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
    server: {
    //host: "127.0.0.1",
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "https://localhost:5079",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
