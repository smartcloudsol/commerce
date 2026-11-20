export function contextIdentity(value: unknown): string;
export function savedSetup(
  settings: any,
  record: any,
  experienceLoaded: boolean,
): {
  presentations: any[];
  pricingTableIds: string[];
  buyButtonIds: string[];
  draft: any[];
  hasDraft: boolean;
  cached: boolean;
  hasSaved: boolean;
};
export function paymentLinkUsage(
  url: string,
  published: any,
): { id: string; name: string; type: string }[];
export function embedIds(settings: Record<string, any>, key: string): string[];
export function manualSettings(
  settings: Record<string, any>,
  publishableKey: string,
  pricingTables: string,
  buyButtons: string,
): Record<string, any>;
export function availablePrices(catalog: {
  products: any[];
  prices: any[];
}): any[];
export function createStarterPresentation(
  base: any,
  catalog: { products: any[]; prices: any[] },
  name: string,
  type: string | null,
  selectedPrices: string[],
): { draft: any; presentationId: string };
