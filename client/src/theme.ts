import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Electric-indigo brand ramp (index 6 = the main brand colour).
const brand: MantineColorsTuple = [
  '#f2eefe',
  '#e0d7fc',
  '#bfa8f8',
  '#9d78f6',
  '#7f4ff4',
  '#6c37f3',
  '#5b3df5',
  '#4a2fe0',
  '#3d27bd',
  '#301e99',
];

// VS Code-style dark greys  muted, low-contrast, easy on the eyes.
// Index mapping (Mantine): 0 = text … 7 = body background.
const dark: MantineColorsTuple = [
  '#d4d4d4', // 0  primary text (VS editor foreground)
  '#c8c8c8', // 1
  '#9d9d9d', // 2  dimmed text
  '#858585', // 3  placeholder
  '#3c3c3c', // 4  borders
  '#333333', // 5  subtle border / hover
  '#252526', // 6  surfaces: cards, inputs, menus (VS panel)
  '#1e1e1e', // 7  body background (VS editor)
  '#1a1a1a', // 8
  '#141414', // 9
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  colors: { brand, dark },
  defaultRadius: 'md',
  fontFamily:
    "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "'Space Mono', ui-monospace, monospace",
  headings: {
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    fontWeight: '600',
  },
});
