# SmartBiz TZ 🏪

**SmartBiz** is a full mobile-first business management platform for SMEs in Tanzania and East Africa. Built with React Native (Expo) + Supabase.

## Screenshots
The UI matches the ServePoint design system — dark green sidebar (#1B3A2D), gold/amber accent (#C49A2A), clean card layouts.

### Screens implemented:
- **Login / Register / Forgot Password**
- **Onboarding** (Business setup, Category, Currency, Plan selection)
- **Dashboard** — Live sales stats, line chart, revenue donut, employee ranking, trending dishes
- **Food & Drinks** — Categories grid → Product grid → Product detail with Add to Order
- **Bills** — Order list with status badges + order detail panel with charge button
- **Settings** — Profile, Notifications, Appearance, Checkout Settings, Security, Language & Region

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native + Expo SDK 54 |
| Backend/BaaS | Supabase |
| Database | PostgreSQL (via Supabase) |
| Auth | Supabase Auth |
| Navigation | React Navigation v7 |
| Charts | Native RN components |
| State | React Context (Auth + Cart) |
| Language | TypeScript |

---

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Go to [supabase.com](https://supabase.com) and create a project
2. In SQL editor, run the contents of `supabase_schema.sql`
3. Copy your **Project URL** and **anon public key** from Project Settings → API

### 3. Configure environment
Create `.env` in the project root:
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Start the app
```bash
# Start development server
npx expo start

# Android
npx expo start --android

# iOS
npx expo start --ios
```

---

## Project Structure

```
smartbiz-tz/
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   └── constants.ts         # Design tokens (colors, fonts, spacing)
│   ├── types/
│   │   └── index.ts             # All TypeScript types
│   ├── context/
│   │   ├── AuthContext.tsx      # Auth state + Supabase auth
│   │   └── CartContext.tsx      # POS cart state
│   ├── navigation/
│   │   └── AppNavigator.tsx     # Root navigator (auth → onboarding → main)
│   ├── components/
│   │   └── common/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Header.tsx
│   │       ├── Input.tsx
│   │       ├── Sidebar.tsx
│   │       └── Toggle.tsx
│   └── screens/
│       ├── MainLayout.tsx        # Sidebar + content layout
│       ├── auth/
│       │   ├── LoginScreen.tsx
│       │   ├── RegisterScreen.tsx
│       │   └── ForgotPasswordScreen.tsx
│       ├── onboarding/
│       │   └── OnboardingScreen.tsx
│       ├── dashboard/
│       │   └── DashboardScreen.tsx
│       ├── products/
│       │   ├── CategoriesScreen.tsx
│       │   └── CategoryItemsScreen.tsx
│       ├── bills/
│       │   └── BillsScreen.tsx
│       └── settings/
│           └── SettingsScreen.tsx
├── supabase_schema.sql           # Full DB schema with RLS
├── App.tsx
├── app.json
└── babel.config.js
```

---

## Database Schema

14 tables with full Row Level Security (RLS):
- `users` — Extended auth profile with role
- `businesses` — Business profiles
- `subscriptions` — Plan management
- `categories` — Product categories
- `products` — Inventory with stock tracking
- `customers` — Customer profiles + credit
- `sales` — Orders with table/guest info
- `sale_items` — Line items per order
- `inventory_logs` — Stock change audit trail
- `staff` — Staff with permissions
- `notifications` — Push/email notifications
- `settings` — Per-business settings
- `activity_logs` — Audit trails
- `support_tickets` — Support system

---

## User Roles

| Role | Access |
|---|---|
| **Owner** | Full access: products, sales, staff, reports, settings |
| **Staff/Cashier** | POS, limited dashboard |
| **Admin** | Platform-wide: users, businesses, revenue, subscriptions |

---

## MVP Features (v1)

- [x] Authentication (login, register, forgot password, OTP verify)
- [x] Business onboarding (profile, category, currency, plan)
- [x] Dashboard with sales analytics
- [x] Food & Drinks categories + product grid
- [x] POS — Add to cart, product details
- [x] Bills — Order list and detail panel
- [x] Settings — All 6 subsections
- [x] Supabase database schema with RLS

## Roadmap (v2/v3)
- [ ] AI sales prediction
- [ ] Barcode scanner
- [ ] Full offline mode
- [ ] Multi-branch support
- [ ] Tax automation
- [ ] Loyalty program
- [ ] ERP integrations

---

## Security
- Row Level Security enforced on all tables
- Passwords hashed by Supabase Auth (bcrypt)
- No secrets in code — env vars only
- Device session management
- Audit trails via `activity_logs`
