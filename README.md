EXPRESS

A Nigeria-first electronics marketplace with built-in price intelligence.

EXPRESS helps people discover electronics, spare parts, components, repair tools and accessories, while making real-world prices easier to understand.

Our initial launch focus is Port Harcourt, Nigeria, with nationwide coverage as the platform develops.

What EXPRESS offers

1. Marketplace

A place for buyers to discover electronics and connect with sellers.

The marketplace is designed for:

- Phone and electronics technicians
- Buyers and electronics enthusiasts
- Retailers and wholesalers
- Spare-parts dealers and suppliers

Sellers will be able to manage their stores and listings. Buyers will be able to browse public listings and request seller contact through a controlled contact-sharing process.

2. PriceCheck

PriceCheck is EXPRESS's built-in price intelligence feature.

It organizes real-world price observations by:

- Exact product and variant
- Product condition
- Price and currency
- Country and location
- Observation date
- Evidence and review status

Seller asking prices are not verified market prices. Marketplace offers remain separate from reviewed price observations. Only qualifying, reviewed observations can contribute to published PriceCheck ranges.

Product coverage

EXPRESS supports a catalogue designed for:

- Phones and smartphones
- Tablets and computers
- TVs and displays
- Audio and networking equipment
- Phone and computer spare parts
- Electronics components
- Repair tools and equipment
- Accessories and other electronics

Condition distinctions include new, used and refurbished products, with parts-specific distinctions such as new aftermarket and used or salvaged components.

Geographic coverage

The initial focus is Port Harcourt, Rivers State, Nigeria.

The data architecture supports nationwide Nigerian coverage, including states, local government areas, cities and areas. More detailed local price ranges will only be published when enough reliable observations are available.

The platform is designed to support expansion into other countries in the future.

Trust and privacy

EXPRESS is built around these principles:

- Keep seller asking prices separate from verified price intelligence.
- Preserve exact product and variant information.
- Use evidence-backed price observations and review workflows.
- Apply seller verification and listing moderation.
- Protect private seller phone and WhatsApp details.
- Require an approved contact-unlock process before sharing private seller contact information.
- Never invent products, listings or market prices.

Technology

- Next.js 14
- React 18
- TypeScript
- Supabase
- PostgreSQL
- Supabase Row Level Security

Development status

The Supabase backend foundation is deployed. It includes product and geographic catalogues, seller profiles, marketplace listings, price observations, review and moderation workflows, and price-range calculation infrastructure.

The frontend is being connected to the existing backend incrementally.

Authentication, seller onboarding, listing management, image uploads, price-report submission, moderation screens and seller contact unlocking still need frontend integration and end-to-end testing.

Important backend note

The live Supabase project already has its own deployed schema and security rules.

Do not run "supabase/schema.sql" from this repository against the existing live project. That file is an obsolete initial draft, retained as historical starter material. The live database is managed through its existing migrations.

Environment setup

Copy ".env.example" to ".env.local" and configure:

- "NEXT_PUBLIC_SUPABASE_URL"
- "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" (preferred; the legacy "NEXT_PUBLIC_SUPABASE_ANON_KEY" is also supported)

Use only the public publishable key (or legacy anon key) in the frontend. Never expose a service-role key or secret key in browser code or in a "NEXT_PUBLIC_" variable.

Mission

Make electronics sourcing and price discovery more transparent, accessible and dependable — starting in Nigeria.
