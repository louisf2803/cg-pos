// Skala spasi proyek hanya mendefinisikan 4/8/12/…; kunci kecil di bawah ini dipakai kasir dan harus berupa piksel (bukan skala bawaan Tailwind).
module.exports = {
  presets: [require('../../packages/ui/src/tailwind.preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { spacing: { 1: '1px', 2: '2px', 3: '3px', 5: '5px', 6: '6px', 10: '10px', 36: '36px' } } },
};
