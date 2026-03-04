const BRAND = {
  name: 'ElevatorIQ',
  domain: 'elevatoriq.ai',
  reportsFromEmail: 'reports@elevatoriq.ai',
  tagline: 'Structured intelligence, not guesswork.',
  footerTagline: '"Upload. Analyze. Decide."',
  replacementNote: 'Branded report style is aligned to the provided ElevatorIQ sample layout and tone.',
};

const COLORS = {
  ink: '#0B0E13',
  inkLight: '#12161E',
  inkMid: '#1A1F2A',
  inkSoft: '#222836',
  accent: '#00B876',
  accentHover: '#00CC84',
  white: '#FFFFFF',
  offWhite: '#F5F6F8',
  gray50: '#E8EAF0',
  gray100: '#D0D4DC',
  gray300: '#9AA0AE',
  gray400: '#7C8290',
  gray500: '#5E6470',
  gray600: '#3E4452',
  risk: '#E85D5D',
  caution: '#E8A840',
  clear: '#00B876',
};

const TYPOGRAPHY = {
  sans: "'DM Sans', Helvetica, Arial, sans-serif",
  mono: "'DM Mono', 'SFMono-Regular', Menlo, monospace",
  googleFontsCss2:
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap',
};

function logoWordmarkHtml(className = 'brand-wordmark') {
  return `<span class="${className}">Elevator<span class="brand-wordmark-accent">IQ</span></span>`;
}

module.exports = {
  BRAND,
  COLORS,
  TYPOGRAPHY,
  logoWordmarkHtml,
};
