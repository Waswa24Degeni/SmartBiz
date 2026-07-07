# SmartEnterprise TZ

SmartEnterprise is a mobile-first business operating system for small and medium businesses in Tanzania and East Africa.

It helps owners run daily operations across POS, inventory, billing, invoicing, reporting, staff, wallet tracking, internal messaging, and owner-admin support from one application.

## Why This Matters in Tanzania and East Africa

Many businesses in the region still struggle with:

- fragmented tools (paper, WhatsApp, spreadsheets, separate payment apps)
- limited visibility on daily profit and cash movement
- mixed payment channels (cash + mobile money + card) without unified records
- weak internal controls when multiple staff share POS workflows
- customer and supplier tracking gaps that cause leakage and disputes
- support delays when business owners need direct platform help

SmartEnterprise addresses these issues with a single system built for local realities:

- fast mobile workflows for shop, restaurant, and service businesses
- role-based access for owner, staff, and admin operations
- sales and payment tracking in TZS-ready business flows
- printable reports and downloadable Excel-compatible exports
- owner-admin support channel separate from internal staff messaging

## What SmartEnterprise Does Today

### Core Business Modules

- authentication and onboarding
- dashboard with business KPIs
- product and category management
- POS and cart-based checkout
- bills and customer records
- staff management and permissions
- settings and business profile customization
- wallet and payment tracking

### Reporting and Documents

- sales report with detailed line-level profitability:
	- product name
	- cost price
	- cashier
	- selling price
	- quantity
	- total amount
	- net profit
- advanced report view for additional operational insight
- print-ready full report pages on desktop and mobile
- Excel-compatible CSV export
- invoicing lifecycle support (proforma, invoice, receipt)

### Communication Flows

- messages section for internal team communication (owner, manager, staff)
- support section for owner-admin communication
- threaded support conversations and notifications

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native + Expo SDK 54 |
| Backend/BaaS | Supabase |
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Navigation | React Navigation v7 |
| State | React Context |
| Language | TypeScript |

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a .env file in project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set up database

In Supabase SQL Editor, run:

1. supabase_schema.sql
2. scripts/invoicing-system.sql
3. scripts/support-messaging-module.sql
4. any additional script in scripts/ needed for your deployment

### 4. Run the app

```bash
npm run start
```

Optional targets:

```bash
npm run android
npm run ios
npm run web
```

## Current Project Structure

```text
smartenterprise-tz/
	src/
		components/
		context/
		lib/
		navigation/
		screens/
			admin/
			auth/
			bills/
			customers/
			dashboard/
			invoices/
			messages/
			onboarding/
			pos/
			products/
			reports/
			settings/
			staff/
			support/
			wallet/
	scripts/
		invoicing-system.sql
		support-messaging-module.sql
		wallet-module.sql
		payment-module.sql
		setup-staff-module.sql
	supabase_schema.sql
```

## Roles and Access

| Role | Typical Access |
|---|---|
| Owner | Full business control: products, staff, sales, reports, settings, support |
| Staff / Cashier | Operational tools such as POS, bills, selected modules by permission |
| Admin | Platform-level management, support response, revenue and oversight tools |

## Security and Data Integrity

- row-level security (RLS) policies applied in Supabase
- business-level data isolation
- audit-friendly payment and document logs
- role-based feature access in app and database flows
- secrets managed via environment variables

## Regional Impact Goals

SmartEnterprise is designed to help East African SMEs:

- reduce daily reconciliation time
- improve inventory and cash accountability
- increase owner visibility into true net profit
- improve team coordination and response speed
- build trust with cleaner receipts, invoices, and reports

## Contributing

Contributions are welcome. Focus areas:

- offline-first behavior and sync resilience
- multi-branch operations
- improved East African tax and compliance workflows
- deeper local payment and reporting integrations

## License

This project is private unless otherwise specified by repository owner.
