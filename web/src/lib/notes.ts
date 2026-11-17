/**
 * Short labels for the notes in the matrix. The full text stays in the
 * tooltip and in the supplier profile.
 */
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Data missing · (\d+) of (\d+) verified/, (m) => `${m[1]} of ${m[2]} verified`],
  [/^Price outdated: (\d+) days old/, (m) => `Price ${m[1]} days old`],
  [/^CO₂ data outdated: ([\d.]+) years old/, (m) => `CO₂ data ${m[1]} yrs old`],
  [/^Indicative price only/, () => "Indicative price"],
  [/^CO₂ value estimated/, () => "CO₂ estimated"],
  [/^Lead time not verified/, () => "Lead time unverified"],
  [/^Lead time (\d+) days?, too late/, (m) => `Too late (${m[1]} days)`],
  [/^LkSG country risk: (\w+)/, (m) => `LkSG risk ${m[1]}`],
  [/^Reported: /, () => "Controversy reported"],
  [/^(.+): evidence not verified$/, (m) => `${m[1]} not verified`],
];

export function shortNote(text: string): string {
  for (const [pattern, label] of RULES) {
    const m = text.match(pattern);
    if (m) return label(m);
  }
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}
