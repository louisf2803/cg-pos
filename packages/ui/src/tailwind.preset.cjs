/* Dihasilkan dari tokens.json oleh build-tokens.py. Pakai: presets: [require('./design/tailwind.preset.cjs')]
   Komponen memakai bg-surface text-muted dst, tidak pernah hex mentah.
   Catatan: warna memakai var(), jadi pengubah opasitas seperti bg-accent/50 tidak tersedia; pakai token *-soft. */
module.exports = {
  theme: {
    screens: { tablet: '600px', desktop: '1200px' },
    extend: {
      colors: {
      'bg': 'var(--color-bg)',
      'surface': 'var(--color-surface)',
      'surface-raised': 'var(--color-surface-raised)',
      'border': 'var(--color-border)',
      'border-input': 'var(--color-border-input)',
      'text': 'var(--color-text)',
      'text-muted': 'var(--color-text-muted)',
      'accent': 'var(--color-accent)',
      'accent-hover': 'var(--color-accent-hover)',
      'accent-active': 'var(--color-accent-active)',
      'on-accent': 'var(--color-on-accent)',
      'accent-soft': 'var(--color-accent-soft)',
      'accent-strong': 'var(--color-accent-strong)',
      'danger': 'var(--color-danger)',
      'danger-soft': 'var(--color-danger-soft)',
      'danger-strong': 'var(--color-danger-strong)',
      'on-danger': 'var(--color-on-danger)',
      'success': 'var(--color-success)',
      'success-soft': 'var(--color-success-soft)',
      'success-strong': 'var(--color-success-strong)',
      'warning-soft': 'var(--color-warning-soft)',
      'warning-strong': 'var(--color-warning-strong)',
      'info-soft': 'var(--color-info-soft)',
      'info-strong': 'var(--color-info-strong)',
      'overlay': 'var(--color-overlay)',
      'table-empty': 'var(--color-table-empty)',
      'table-empty-text': 'var(--color-table-empty-text)',
      'table-seated': 'var(--color-table-seated)',
      'table-seated-text': 'var(--color-table-seated-text)',
      'table-ordered': 'var(--color-table-ordered)',
      'table-ordered-text': 'var(--color-table-ordered-text)',
      'table-billed': 'var(--color-table-billed)',
      'table-billed-text': 'var(--color-table-billed-text)',
      'table-near-limit': 'var(--color-table-near-limit)',
      'table-near-limit-text': 'var(--color-table-near-limit-text)',
      'table-over-limit': 'var(--color-table-over-limit)',
      'table-over-limit-text': 'var(--color-table-over-limit-text)'
      },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      fontSize: {
      'xs': ['var(--text-xs)', { lineHeight: 'var(--text-xs-line)', fontWeight: 'var(--text-xs-weight)' }],
      'sm': ['var(--text-sm)', { lineHeight: 'var(--text-sm-line)', fontWeight: 'var(--text-sm-weight)' }],
      'base': ['var(--text-base)', { lineHeight: 'var(--text-base-line)', fontWeight: 'var(--text-base-weight)' }],
      'lg': ['var(--text-lg)', { lineHeight: 'var(--text-lg-line)', fontWeight: 'var(--text-lg-weight)' }],
      'xl': ['var(--text-xl)', { lineHeight: 'var(--text-xl-line)', fontWeight: 'var(--text-xl-weight)' }],
      'display': ['var(--text-display)', { lineHeight: 'var(--text-display-line)', fontWeight: 'var(--text-display-weight)' }],
      'money-lg': ['var(--text-money-lg)', { lineHeight: 'var(--text-money-lg-line)', fontWeight: 'var(--text-money-lg-weight)' }]
      },
      borderRadius: {
      'sm': 'var(--radius-sm)',
      'md': 'var(--radius-md)',
      'lg': 'var(--radius-lg)',
      'xl': 'var(--radius-xl)',
      'pill': 'var(--radius-pill)'
      },
      boxShadow: {
      'card': 'var(--shadow-card)',
      'pop': 'var(--shadow-pop)',
      'focus': 'var(--shadow-focus)'
      },
      spacing: {
      '4': 'var(--space-4)',
      '8': 'var(--space-8)',
      '12': 'var(--space-12)',
      '16': 'var(--space-16)',
      '20': 'var(--space-20)',
      '24': 'var(--space-24)',
      '32': 'var(--space-32)',
      '40': 'var(--space-40)',
      '48': 'var(--space-48)',
      '64': 'var(--space-64)'
      },
      minHeight: { touch: 'var(--touch-min)' },
      minWidth: { touch: 'var(--touch-min)' },
      transitionDuration: { fast: 'var(--motion-fast)', base: 'var(--motion-base)' },
      transitionTimingFunction: { DEFAULT: 'var(--motion-ease)' }
    }
  }
};
