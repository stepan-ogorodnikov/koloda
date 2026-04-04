function interpolate(strings: TemplateStringsArray, values: unknown[]) {
  return strings.reduce((acc, part, index) => (
    acc + part + (index < values.length ? String(values[index]) : "")
  ), "");
}

export function msg(strings: TemplateStringsArray, ...values: unknown[]) {
  return interpolate(strings, values);
}

export function plural(_: number, forms: { other: string }) {
  return forms.other;
}
