import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// VITE_BASE: awalan jalur saat dihosting di subfolder (mis. /cg-pos/pos/). Kosong = akar domain.
export default defineConfig({ base: process.env.VITE_BASE || '/', plugins: [react()], server: { host: true } });
