export const themeColors: {
  primary: { light: string; dark: string };
  background: { light: string; dark: string };
  surface: { light: string; dark: string };
  surface2: { light: string; dark: string };
  foreground: { light: string; dark: string };
  muted: { light: string; dark: string };
  tertiary: { light: string; dark: string };
  border: { light: string; dark: string };
  coach: { light: string; dark: string };
  admin: { light: string; dark: string };
  client: { light: string; dark: string };
  success: { light: string; dark: string };
  warning: { light: string; dark: string };
  closed: { light: string; dark: string };
  booked: { light: string; dark: string };
  error: { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
