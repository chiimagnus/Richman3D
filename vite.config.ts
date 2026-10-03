import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/Richman3D/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
});
