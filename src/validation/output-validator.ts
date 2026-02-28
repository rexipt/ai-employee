export interface DailyBriefingExpectedValues {
  totalRevenue: number;
  totalSpend: number;
  blendedMer: number;
  orders: number;
  avgOrderValue: number;
  googleAttributedRevenue: number;
  metaAttributedRevenue: number;
  campaignRevenue: number;
  flowRevenue: number;
}

function hasLine(message: string, expected: string): boolean {
  return message.split("\n").some((line) => line.trim() === expected.trim());
}

export function validateDailyBriefingOutput(
  message: string,
  expected: DailyBriefingExpectedValues,
): void {
  const expectedLines = [
    `Revenue: $${expected.totalRevenue.toFixed(2)}`,
    `Spend: $${expected.totalSpend.toFixed(2)}`,
    `Blended MER: ${expected.blendedMer.toFixed(2)}x`,
    `Orders: ${expected.orders}`,
    `AOV: $${expected.avgOrderValue.toFixed(2)}`,
    `Attribution: Google $${expected.googleAttributedRevenue.toFixed(2)} | Meta $${expected.metaAttributedRevenue.toFixed(2)}`,
    `Email/SMS Revenue: Campaigns $${expected.campaignRevenue.toFixed(2)} | Flows $${expected.flowRevenue.toFixed(2)}`,
  ];

  for (const line of expectedLines) {
    if (!hasLine(message, line)) {
      throw new Error(`Output validation failed. Missing line: ${line}`);
    }
  }
}
