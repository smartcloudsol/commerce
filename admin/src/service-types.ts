export type Service = {
  schemaVersion: number;
  apiConnection: string;
  apiName: string;
  apiUrl: string;
  mappings: { feature: string; group: string }[];
  stripe?: { accountId: string; mode: "test" | "live"; publishableKey: string };
};
