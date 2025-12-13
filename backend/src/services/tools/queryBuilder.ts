type IntentCategory =
  | "real_estate"
  | "restaurants"
  | "hotels"
  | "ski_resorts"
  | "healthcare"
  | "generic";

export interface SearchFilters {
  query?: string;
  beds?: number;
  maxPrice?: number;
  cuisine?: string;
  features?: string[];
  dates?: string;
  specialty?: string;
  budgetPerNight?: number;
  starRating?: number;
  guests?: number;
}

export interface UserIntent {
  category: IntentCategory;
  location: string;
  filters?: SearchFilters;
}

const formatPrice = (price?: number): string => {
  if (typeof price !== "number" || !Number.isFinite(price)) {
    return "";
  }
  return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

const joinParts = (parts: Array<string | undefined>): string =>
  parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();

const domainByCategory: Record<IntentCategory, string[]> = {
  real_estate: ["site:zillow.com", "site:redfin.com"],
  restaurants: ["site:maps.google.com", "site:yelp.com"],
  hotels: ["site:booking.com", "site:hotels.com"],
  ski_resorts: ["site:booking.com", "site:tripadvisor.com"],
  healthcare: ["site:maps.google.com"],
  generic: [],
};

const buildRealEstateQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  const price = formatPrice(filters?.maxPrice);
  const beds =
    typeof filters?.beds === "number" && filters.beds > 0
      ? `${filters.beds}+ bed`
      : "";

  return joinParts([
    filters?.query ?? "homes for sale",
    beds,
    price ? `under ${price}` : undefined,
    `"${location}"`,
  ]);
};

const buildRestaurantQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  const cuisine = filters?.cuisine ?? "restaurants";
  const features =
    filters?.features && filters.features.length > 0
      ? filters.features.join(" ")
      : "";

  return joinParts([
    filters?.query ?? `best ${cuisine}`,
    features,
    `"${location}"`,
  ]);
};

const buildHotelQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  const budget =
    typeof filters?.budgetPerNight === "number"
      ? `under ${formatPrice(filters.budgetPerNight)} per night`
      : "";

  return joinParts([
    filters?.query ?? "hotels",
    `"${location}"`,
    filters?.dates,
    budget,
  ]);
};

const buildSkiQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  return joinParts([
    filters?.query ?? "ski resorts",
    `"${location}"`,
    filters?.dates,
    "snow conditions",
  ]);
};

const buildHealthcareQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  const specialty = filters?.specialty ?? "doctor";

  return joinParts([
    specialty,
    "accepting new patients",
    `"${location}"`,
    filters?.features?.join(" "),
  ]);
};

const buildGenericQuery = (intent: UserIntent): string => {
  const { filters, location } = intent;
  return joinParts([filters?.query ?? "points of interest", `"${location}"`]);
};

const builders: Record<IntentCategory, (intent: UserIntent) => string> = {
  real_estate: buildRealEstateQuery,
  restaurants: buildRestaurantQuery,
  hotels: buildHotelQuery,
  ski_resorts: buildSkiQuery,
  healthcare: buildHealthcareQuery,
  generic: buildGenericQuery,
};

const buildScopedQueries = (
  category: IntentCategory,
  baseQuery: string
): string[] => {
  const domains = domainByCategory[category];

  if (!domains.length) {
    return [baseQuery];
  }

  return domains.map((domain) => joinParts([domain, baseQuery]));
};

export const buildSearchQueries = (intent: UserIntent): string[] => {
  const builder = builders[intent.category] ?? buildGenericQuery;
  const baseQuery = builder(intent);
  return buildScopedQueries(intent.category, baseQuery);
};

export interface QueryToolInput {
  category: IntentCategory;
  location: string;
  filters?: SearchFilters;
}

export interface QueryToolOutput {
  queries: string[];
}

// Tool-friendly helper
export const buildSearchQueriesForTool = (input: {
  category: IntentCategory;
  location: string;
  filters?: SearchFilters;
}): string[] => buildSearchQueries(input);

export const SUPPORTED_CATEGORIES: IntentCategory[] = [
  "real_estate",
  "restaurants",
  "hotels",
  "ski_resorts",
  "healthcare",
  "generic",
];
