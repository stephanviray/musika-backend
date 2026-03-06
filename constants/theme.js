// Musika Design System - Premium dark theme inspired by Spotify
export const COLORS = {
  // Primary brand
  primary: '#1DB954',         // Spotify green accent
  primaryDark: '#158a3d',
  primaryLight: '#1ed760',
  
  // Backgrounds
  background: '#0a0a0f',       // Deep dark
  surface: '#121218',          // Cards/surfaces
  surfaceLight: '#1a1a24',     // Elevated surfaces
  surfaceHighlight: '#252535', // Hover/active states
  
  // Gradients
  gradientStart: '#1DB954',
  gradientMid: '#1aa34a',
  gradientEnd: '#148a3d',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textMuted: '#6a6a7a',
  
  // Accents
  accent: '#8B5CF6',           // Purple accent
  accentBlue: '#3B82F6',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#1DB954',
  
  // Misc
  border: '#2a2a3a',
  overlay: 'rgba(0, 0, 0, 0.7)',
  playerBg: '#181820',
  miniPlayerBg: '#1e1e2a',
};

export const FONTS = {
  light: { fontWeight: '300' },
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semiBold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  extraBold: { fontWeight: '800' },
};

export const SIZES = {
  // Spacing
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  
  // Border radius
  radiusSm: 6,
  radiusMd: 10,
  radiusLg: 16,
  radiusXl: 24,
  radiusFull: 9999,
  
  // Typography
  textXs: 11,
  textSm: 13,
  textBase: 15,
  textLg: 18,
  textXl: 22,
  text2xl: 28,
  text3xl: 34,
  text4xl: 42,
  
  // Layout
  miniPlayerHeight: 64,
  tabBarHeight: 56,
  headerHeight: 56,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  glow: {
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
};
