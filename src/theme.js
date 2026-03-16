// Poolside Dusk — SipPing visual identity

export const colors = {
  bg: '#FAF6F1',
  card: '#FFFFFF',
  navy: '#1E2B3A',
  teal: '#2EC4B6',
  amber: '#E8945A',
  cta: '#FF6B6B',
  lavender: '#B8A9C9',
  success: '#4CAF7D',
  error: '#E05555',
  textSecondary: '#7A8B99',
  textTertiary: '#A0ADB8',
  border: '#EDE8E3',
  cardShadow: 'rgba(30, 43, 58, 0.08)',
};

export const fonts = {
  heading: 'Fredoka_700Bold',
  headingSemiBold: 'Fredoka_600SemiBold',
  headingMedium: 'Fredoka_500Medium',
  headingRegular: 'Fredoka_400Regular',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  bodySemiBold: 'Outfit_600SemiBold',
  bodyBold: 'Outfit_700Bold',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  card: 16,
  pill: 24,
};

export const shadows = {
  card: {
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardLg: {
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
  },
};

export const typography = {
  h1: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.navy,
  },
  h2: {
    fontFamily: fonts.headingSemiBold,
    fontSize: 22,
    color: colors.navy,
  },
  h3: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    color: colors.navy,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.navy,
  },
  bodyMedium: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.navy,
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
};
