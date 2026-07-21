export function parseImportRows(csv: string) {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const errors: string[] = [];
  let valid = 0;
  lines.forEach((line, index) => {
    const [customer, weight, destination] = line.split(',');
    if (!customer?.trim() || !weight || !Number.isFinite(Number(weight)) || !destination?.trim())
      errors.push(`第 ${index + 2} 行：客户、重量或目的地无效`);
    else valid += 1;
  });
  return { valid, invalid: errors.length, errors };
}
