# Design Guidelines: AI Purchase Order Management System

## Design Approach
**System Selected:** Fluent Design (Microsoft)
**Rationale:** Optimized for productivity applications with data-heavy interfaces, form management, and enterprise workflows. Fluent's emphasis on clarity, depth, and motion aligns perfectly with a B2B trade management tool requiring efficient data entry and review.

## Core Design Principles
1. **Clarity First:** Information hierarchy guides users through complex workflows
2. **Confident Automation:** AI suggestions are helpful, not distracting
3. **Trust Through Transparency:** Uncertainty is clearly communicated
4. **Efficiency:** Minimize clicks, maximize information density

---

## Typography System

**Font Family:** Segoe UI (fallback: system-ui, -apple-system, sans-serif)

**Hierarchy:**
- Page Titles: 32px, semibold (font-semibold)
- Section Headers: 24px, semibold
- Card/Panel Titles: 18px, semibold
- Body Text: 14px, regular
- Helper Text: 12px, regular
- Table Headers: 13px, semibold, uppercase tracking
- Data/Numbers: 14px, tabular-nums for alignment

---

## Layout System

**Spacing Primitives:** Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., p-4, gap-6, mt-8)

**Grid Structure:**
- Main content area: max-w-7xl mx-auto
- Sidebar navigation: 240px fixed width
- Dashboard cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Forms: max-w-2xl for optimal readability
- Tables: Full-width within container with horizontal scroll if needed

**Container Padding:** px-6 py-8 (desktop), px-4 py-6 (mobile)

---

## Component Library

### Navigation
- **Top Bar:** Fixed header with logo, primary navigation, user profile
- **Side Navigation:** Collapsible sidebar with icon + label, active state with accent border-left
- **Breadcrumbs:** Show context for nested views (Home > Suppliers > EverFloor Supplies)

### Cards & Panels
- **Standard Card:** Rounded-lg, shadow-sm, p-6, border subtle
- **Data Card:** Includes header with icon, metric display, and optional action button
- **AI Suggestion Card:** Distinct treatment with soft accent background, confidence indicator badge

### Forms
- **Input Fields:** h-10, rounded-md, border with focus ring
- **Labels:** mb-2, text-sm, font-medium
- **Field Groups:** space-y-4 for vertical rhythm
- **Inline Validation:** Real-time feedback with icon + message below field
- **Required Fields:** Asterisk in label, not placeholder

### Tables
- **Structure:** Striped rows (even row subtle background), hover state
- **Headers:** Sticky positioning, border-b-2 for emphasis
- **Cell Padding:** px-4 py-3 for comfortable spacing
- **Actions Column:** Right-aligned, icon buttons for edit/delete
- **Empty States:** Centered message with supportive illustration placeholder

### Data Display
- **Status Badges:** Rounded-full, px-3 py-1, text-xs uppercase
  - Draft: Neutral gray
  - Pending: Amber
  - Approved: Green
  - Sent: Blue
- **Confidence Indicators:** Progress bar or percentage badge (0-100%)
- **Uncertainty Highlights:** Dashed border on fields, yellow accent for attention

### AI Feedback Components
- **Question Panels:** Expanded card with question text, reason, suggested options as radio buttons
- **Reasoning Summary:** Collapsible section with bullet points
- **Profitability Hints:** Info icon with tooltip showing savings estimate

### Buttons & Actions
- **Primary:** Solid background, px-6 py-2.5, rounded-md
- **Secondary:** Outline style, border-2
- **Tertiary:** Text-only with hover underline
- **Icon Buttons:** Circular for standalone actions, square for toolbar
- **Button Groups:** Spaced with gap-2, primary action on right

### Overlays
- **Modals:** max-w-2xl, centered, backdrop blur
- **Slide-Overs:** Fixed right panel for editing/details (w-96)
- **Tooltips:** Small, dark background, white text, arrow pointer
- **Dropdowns:** Shadow-lg, rounded-lg, py-1, max-h-64 with scroll

---

## Application-Specific Patterns

### PO Creation Workflow
1. **Input Screen:** Large textarea with AI processing button, example prompts shown as chips
2. **Draft Review:** Two-column layout - left: line items table, right: AI questions panel
3. **Editing Mode:** Inline editable fields with save/cancel per row
4. **Confirmation:** Summary card with totals, supplier info, delivery details

### Dashboard Layout
- **Stats Row:** 4 metric cards (Total POs, Pending Approval, Monthly Spend, Active Suppliers)
- **Recent Activity:** Timeline-style list with timestamps
- **Quick Actions:** Prominent "Create New PO" button, search bar

### Price List Management
- **Tiered Pricing Display:** Nested table rows showing min/max quantity breaks
- **SKU Grouping:** Expandable sections by product category
- **Bulk Actions:** Checkbox selection with toolbar for batch operations

---

## Animations
**Minimal, purposeful only:**
- Page transitions: None (instant navigation)
- Card/modal entry: Subtle fade-in (150ms)
- AI processing: Pulsing indicator on submit button
- Success feedback: Checkmark animation on save (300ms)
- NO scroll-triggered animations, NO hover morphs

---

## Images
**This application does not require hero images or marketing imagery.** Focus is on functional UI with:
- Supplier logos (small, 40x40px, in table/card headers)
- Empty state illustrations (simple, line-art style)
- User avatars (circular, 32px)
- Product thumbnails (if added later, 80x80px, rounded)

---

## Quality Standards
- **Information Density:** Pack data efficiently without crowding - use whitespace deliberately
- **Keyboard Navigation:** All actions accessible via keyboard
- **Loading States:** Skeleton screens for tables, spinner for quick actions
- **Error Handling:** Inline validation, toast notifications for system errors
- **Responsive:** Desktop-first, mobile views stack cards vertically, hide sidebar to hamburger menu