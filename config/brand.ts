/**
 * EZPREZZ brand settings.
 * Keep customer-facing identity here so a future rebrand does not require
 * changing database names, API routes, or business logic.
 */
export const brand = {
  name: "EZPREZZ",
  tagline: "Find it. Compare it. Buy with confidence.",
  description: "Explore electronics, compare seller prices and connect with shops across Nigeria.",
  priceFeatureName: "PriceCheck",
  defaultLocationLabel: "Port Harcourt, NG",
  colors: {
    deepGreen: "#002f22",
    lime: "#d9ff35",
    paper: "#f8faf7",
  },
} as const;
