const fs = require('fs');
const gradients = require('./gradient');

function fmtColor(c) {
  return `{${[c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].map(
    (h) => `0x${h}`
  )}}`;
}

fs.writeFileSync(
  'gradient.h',
  `
#ifndef GRADIENT_H
#define GRADIENT_H
typedef struct RGBColor {char r;char g; char b;} RGBColor;
typedef struct ColorGradient {RGBColor from; RGBColor to;} ColorGradient;
ColorGradient gradients[] = {
${gradients
  .filter((v) => v.colors.length == 2)
  .map(
    (v) => `// ${v.name}\n{${v.colors.map((c) => fmtColor(c.slice(1))).join()}}`
  )
  .join(',\n')}};
#endif // GRADIENT_H
`,
  'utf8'
);
