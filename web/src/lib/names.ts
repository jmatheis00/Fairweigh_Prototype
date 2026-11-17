/** "Alu Balkan d.o.o." -> "Alu Balkan": shorter labels for charts and tiles. */
export function shortName(name: string): string {
  return name
    .replace(/\s+(GmbH|AG|SE|SAS|ASA|JSC|d\.o\.o\.|Co\., Ltd\.|Ltd\.?)$/i, "")
    .replace(/\s+(Die Casting|Casting)$/i, "")
    .trim();
}
