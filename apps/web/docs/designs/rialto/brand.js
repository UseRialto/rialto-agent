// Rialto Brand Tokens
// Extracted from logo: warm off-white bg, deep forest green wordmark, terracotta arch

window.RIALTO_BRAND = {
  // Core palette
  bg:           '#f5f0eb',   // warm linen — logo background
  bgMuted:      '#ede8e2',   // slightly darker linen for hover/muted surfaces
  surface:      '#ffffff',   // card surfaces
  surfaceMuted: '#faf7f4',   // tinted white for alt surfaces
  border:       '#e2d9cf',   // warm stone border
  borderStrong: '#c8bdb2',   // stronger border

  // Text
  ink:          '#1e3a2f',   // deep forest green — logo wordmark
  inkSoft:      '#4a6358',   // muted forest for secondary text
  inkMuted:     '#8a9e96',   // light muted for tertiary/placeholder

  // Primary action — forest green
  primary:      '#1e3a2f',
  primaryHover: '#162d24',
  primaryText:  '#ffffff',

  // Accent — terracotta (logo arch)
  accent:       '#c8735a',
  accentHover:  '#b5624b',
  accentLight:  '#f5ede9',   // tinted terracotta bg
  accentBorder: '#e8c4b8',

  // Status colors — warm versions
  success:      '#2d6a4f',   // forest green success
  successLight: '#e8f4ee',
  successBorder:'#a8d5ba',

  warning:      '#a85c2a',   // burnt sienna warning
  warningLight: '#fdf0e8',
  warningBorder:'#e8c4a0',

  danger:       '#8b2e2e',
  dangerLight:  '#fdeaea',
  dangerBorder: '#e8b4b4',

  // Neutral scale
  stone50:  '#faf7f4',
  stone100: '#f0ebe4',
  stone200: '#e2d9cf',
  stone300: '#c8bdb2',
  stone400: '#a89890',
  stone500: '#8a7a72',
  stone600: '#6a5e58',
  stone700: '#4a3e3a',
  stone800: '#2e2420',
  stone900: '#1a1410',

  // Typography
  fontSerif: "'Lora', 'Georgia', serif",
  fontSans:  "'DM Sans', system-ui, sans-serif",
  fontMono:  "'DM Mono', monospace",
};

// Logo SVG — arch mark + wordmark
window.RIALTO_LOGO_SVG = `<svg viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Arch mark -->
  <path d="M4 32 L4 18 Q4 6 16 6 Q28 6 28 18 L28 32 L22 32 L22 18 Q22 12 16 12 Q10 12 10 18 L10 32 Z" fill="#c8735a"/>
  <!-- wordmark: rialto in Lora-style -->
  <text x="36" y="28" font-family="Lora, Georgia, serif" font-size="18" font-weight="600" fill="#1e3a2f" letter-spacing="-0.3">rialto</text>
</svg>`;
