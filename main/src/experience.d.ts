export type Price = {
  id: string;
  currency: string;
  unitAmount: number;
  interval: "month" | "year" | null;
  intervalCount: 1;
  taxBehavior?: "inclusive" | "exclusive" | "unspecified";
};
export type Transition = {
  fromOfferId: string;
  toOfferId: string;
  timing: "immediate" | "period_end";
  proration: "none" | "create_prorations" | "always_invoice";
};
export type Family = {
  id: string;
  name: string;
  purchasePolicy: "single" | "multiple";
  automaticTax?: boolean;
  transitions: Transition[];
  cancellation: { enabled: boolean; atPeriodEnd: boolean };
};
export type Offer = {
  id: string;
  familyId: string;
  productId: string;
  name: string;
  description: string;
  marketingFeatures: string[];
  prices: Price[];
  features: string[];
};
export type Presentation = {
  id: string;
  name: string;
  type: "button" | "table";
  flow: "payment_link" | "checkout";
  offerIds: string[];
  priceIds: string[];
  featuredOfferId?: string;
  buttonLabel: string;
};
export type Experience = {
  schemaVersion: 1;
  families: Family[];
  offers: Offer[];
  presentations: Presentation[];
  notificationProfile: {
    enabled: boolean;
    locale: string;
    senderName: string;
    replyTo: string;
  };
};
export type SubscriptionPolicy = {
  schemaVersion: 1;
  revision: number;
  families: (Omit<Family, "transitions"> & {
    offerIds: string[];
    transitions: Transition[];
    portalConfigurationId?: string;
  })[];
  offers: Record<
    string,
    {
      familyId: string;
      productId: string;
      priceId: string;
      mode: "subscription" | "payment";
      automaticTax?: boolean;
    }
  >;
};
export function parseExperience(raw: unknown): Experience;
export function createEmptyExperience(): Experience;
export function runtimeOfferId(offerId: string, priceId: string): string;
export type Storefront = {
  schemaVersion: 1;
  revision: number;
  accountId: string;
  mode: "test" | "live";
  presentations: (Omit<Presentation, "offerIds" | "priceIds"> & {
    offers: (Pick<
      Offer,
      "id" | "name" | "description" | "marketingFeatures"
    > & {
      prices: (Price & {
        checkoutOfferId: string;
        paymentLinkUrl?: string;
        automaticTax?: true;
      })[];
    })[];
  })[];
};
export type ExperienceRecord = {
  draftRevision: number;
  draft?: Experience;
  publishedRevision: number;
  published?: Storefront;
  publication?: {
    id: string;
    revision: number;
    status: "preparing" | "awaiting_runtime" | "active" | "failed";
    projection?: Storefront;
    failureCode?: "publication_failed";
  };
};
export function projectStorefront(raw: unknown): Storefront;
export function projectExperienceRecord(raw: unknown): ExperienceRecord;
export type CatalogSetupDefinition = {
  name: string;
  description: string;
  marketingFeatures: string[];
  prices: Omit<Price, "id">[];
  featureLookupKeys: string[];
};
export function parseCatalogSetup(raw: unknown): CatalogSetupDefinition;
export type CatalogSetupResult = {
  product: {
    id: string;
    name: string;
    marketingFeatures: string[];
    active: true;
  };
  prices: {
    id: string;
    amount: number;
    currency: string;
    productId: string;
    active: true;
    interval?: "month" | "year";
    intervalCount?: 1;
    taxBehavior?: "inclusive" | "exclusive" | "unspecified";
  }[];
  features: { id: string; name: string; lookupKey: string }[];
};
export function projectCatalogSetupResult(raw: unknown): CatalogSetupResult;
export function compileSubscriptionPolicy(
  raw: unknown,
  revision: number,
  portalConfigurationIds?: Record<string, string>,
): SubscriptionPolicy;
