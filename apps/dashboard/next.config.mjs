/** Ekspor statis: bisa dihosting di GitHub Pages, Cloudflare Pages, atau Vercel tanpa server.
 *  Seluruh data diambil dari browser langsung ke Supabase (dijaga RLS), jadi tidak butuh server Next. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export default {
  transpilePackages: ['@cgpos/shared', '@cgpos/ui'],
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};
