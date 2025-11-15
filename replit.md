# AI Purchase Order Management System

## Overview

This is an AI-powered purchase order management system that converts natural language requests into structured purchase orders. The application uses supplier price lists and business rules to generate draft POs, leveraging OpenAI's API to interpret free-text requests and suggest appropriate orders while surfacing uncertainty when needed.

The system is designed for trade/retail businesses that need to streamline their purchasing workflow by allowing users to create purchase orders using natural language instead of manually filling out forms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool

**Routing**: Wouter for lightweight client-side routing

**UI Library**: shadcn/ui components (Radix UI primitives) with a custom Fluent Design-inspired theme
- Design system optimized for productivity applications with data-heavy interfaces
- Uses Segoe UI font family with system fallbacks
- Custom color system with CSS variables for theming (light/dark mode support)
- Tailwind CSS for styling with custom configuration

**State Management**: 
- TanStack Query (React Query) for server state management
- React Hook Form with Zod for form validation
- Local component state with React hooks

**Key Pages**:
- Dashboard - Overview of POs, suppliers, and statistics
- Create PO - Natural language input for generating draft purchase orders
- Purchase Orders - List and manage existing POs
- Suppliers - CRUD operations for supplier management
- Price Lists - Manage supplier price lists
- Settings - Configure business rules

### Backend Architecture

**Runtime**: Node.js with Express.js server

**Language**: TypeScript with ES modules

**API Design**: RESTful API endpoints under `/api/*`
- `/api/suppliers` - Supplier CRUD operations
- `/api/price-lists` - Price list management
- `/api/purchase-orders` - PO management
- `/api/business-rules` - Business configuration
- `/api/ai/generate-draft-po` - AI-powered PO generation endpoint

**AI Integration**: 
- OpenAI API integration for natural language processing
- Custom prompt engineering to interpret purchase requests
- Confidence scoring and uncertainty surfacing
- Environment variable-based configuration (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)

**Data Storage**:
- Currently using in-memory storage (`MemStorage` class) as the default implementation
- Abstract `IStorage` interface allows for easy swapping to persistent storage
- Drizzle ORM configured for PostgreSQL (ready for database integration)
- Schema defined using Drizzle with Zod validation

### Database Schema

**Tables** (defined in shared/schema.ts using Drizzle ORM):

1. **suppliers** - Supplier information
   - id, name, email, phone, address

2. **price_list_rows** - Product pricing from suppliers
   - Links to suppliers via foreign key
   - Contains SKU, product name, unit type, pricing, min/max quantities
   - Currency support (default GBP)

3. **purchase_orders** - Purchase order headers
   - Supplier name, status, delivery instructions
   - Stores original user request for context
   - Created timestamp

4. **po_items** - Line items for purchase orders
   - Links to purchase orders via foreign key
   - Product details, quantities, pricing
   - AI confidence scoring for suggestions
   - Price source tracking

5. **business_rules** - Configurable business parameters
   - Key-value pairs for default currency, tax rates, fitting rates, etc.

**Validation**: All schemas have corresponding Zod schemas for runtime validation using drizzle-zod

### Design System

**Design Philosophy**: Fluent Design (Microsoft) adapted for purchase order management
- Emphasis on clarity, productivity, and data density
- Confident AI automation with transparent uncertainty
- Structured spacing system (2, 4, 6, 8, 12, 16 units)
- Responsive grid layouts with mobile-first approach

**Component Strategy**:
- Composition-based UI using Radix UI primitives
- Consistent variant system via class-variance-authority
- Elevation system for depth (hover-elevate, active-elevate classes)
- Custom CSS properties for theme customization

## External Dependencies

### Core Services

**OpenAI API**:
- Used for natural language processing of purchase order requests
- Requires API key and base URL configuration
- Integration point: `server/ai-parser.ts`

**PostgreSQL** (configured but not yet connected):
- Database dialect configured via Drizzle
- Connection via `@neondatabase/serverless` package
- Environment variable: `DATABASE_URL`
- Migration folder: `./migrations`

### Key Third-Party Libraries

**Frontend**:
- `@tanstack/react-query` - Server state management
- `react-hook-form` + `@hookform/resolvers` - Form handling
- `zod` - Schema validation
- `date-fns` - Date formatting
- `wouter` - Routing
- Multiple `@radix-ui/*` packages - Accessible UI primitives
- `tailwindcss` - Utility-first CSS
- `lucide-react` - Icon library

**Backend**:
- `express` - Web server framework
- `drizzle-orm` + `drizzle-kit` - Database ORM
- `openai` - OpenAI API client
- `connect-pg-simple` - PostgreSQL session store (configured)

**Build Tools**:
- `vite` - Build tool and dev server
- `tsx` - TypeScript execution for development
- `esbuild` - Production bundling for server code
- `@replit/*` packages - Replit-specific development tools

### Development Setup

**Environment Variables Required**:
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API authentication
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI API endpoint
- `DATABASE_URL` - PostgreSQL connection string (when switching from in-memory storage)

**Note**: The application currently uses in-memory storage and will need database provisioning to persist data across restarts.