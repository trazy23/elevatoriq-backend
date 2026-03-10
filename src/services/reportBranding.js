const BRAND = {
  name: 'ElevatorIQ',
  domain: 'elevatoriq.ai',
  reportsFromEmail: 'reports@elevatoriq.ai',
  tagline: 'Structured intelligence, not guesswork.',
  footerTagline: '"Upload. Analyze. Decide."',
  replacementNote: 'Branded report style is aligned to the provided ElevatorIQ sample layout and tone.',
};

const COLORS = {
  // Dark backgrounds
  ink: '#0F1112',
  inkLight: '#0F1112',
  inkMid: '#111214',
  inkSoft: '#1A1F2A',
  // Brand accent
  accent: '#00B77A',
  accentHover: '#00CC84',
  // Text
  white: '#FFFFFF',
  offWhite: '#F5F6F8',
  primaryText: '#111214',
  bodyText: '#33363A',
  mutedText: '#6F7478',
  // Grays
  lightGray: '#BFC6CB',
  gray50: '#E8EAF0',
  gray100: '#D0D4DC',
  gray300: '#BFC6CB',
  gray400: '#6F7478',
  gray500: '#6F7478',
  gray600: '#33363A',
  // Risk
  risk: '#E85D5D',
  caution: '#E8A840',
  clear: '#00B77A',
};

const TYPOGRAPHY = {
  sans: "'Inter', Helvetica, Arial, sans-serif",
  heading: "'Montserrat', Helvetica, Arial, sans-serif",
  mono: "monospace",
  googleFontsCss2:
    'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Inter:wght@400;500;600;700&display=swap',
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
