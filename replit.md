# Wine Master - Spaced Repetition Quiz Application

## Overview

Wine Master is a web-based educational application that uses spaced repetition algorithms to help users master wine knowledge. The application presents quiz questions about wine regions, grape varieties, winemaking techniques, and other wine-related topics. Using the SM-2 (SuperMemo 2) algorithm, it intelligently schedules question reviews based on user performance to optimize long-term retention.

The application allows users to:
- Take quizzes on wine-related questions with intelligent scheduling
- Track their learning progress and statistics
- Upload custom question sets via JSON

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query (React Query) for server state
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system

**Design System:**
- Material Design principles adapted for wine industry aesthetic
- Typography: Playfair Display (serif) for headings, Inter (sans-serif) for body text
- Color scheme: Wine-themed palette with primary colors in burgundy/wine red tones
- Custom Tailwind configuration with extended color variables using HSL values
- Responsive design with mobile-first approach

**Component Structure:**
- Page-based routing with three main pages: Quiz, Progress, Upload
- Shared UI components from shadcn/ui in `client/src/components/ui/`
- Custom hooks for mobile detection and toast notifications
- Global navigation component with sticky header

**State Management Strategy:**
- TanStack Query for API data fetching and caching
- Query invalidation on data mutations (e.g., after uploading questions)
- Local component state for UI interactions (e.g., quiz answer selection)

### Backend Architecture

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (via Neon serverless)
- **Session Storage**: In-memory storage with interface for potential database migration

**API Design:**
- RESTful API endpoints under `/api` prefix
- Request/response logging middleware
- JSON request body parsing with raw body preservation
- Error handling with appropriate HTTP status codes

**Key Endpoints:**
- `POST /api/questions/upload` - Bulk upload questions from JSON
- `GET /api/quiz/due` - Retrieve questions due for review
- `POST /api/quiz/answer` - Submit quiz answer and update review schedule
- `GET /api/statistics` - Retrieve learning progress statistics

**Storage Layer:**
- Interface-based storage abstraction (`IStorage`)
- Current implementation: In-memory storage (`MemStorage`)
- Design supports future migration to persistent database storage
- Separate concerns: Questions, Review Cards, and Statistics

### Spaced Repetition Algorithm

**SM-2 Implementation:**
- Quality ratings from 0-5 based on user performance
- Ease factor calculation with minimum threshold of 1.3
- Interval progression: 1 day → 6 days → (previous interval × ease factor)
- Failed reviews (quality < 3) reset interval and repetition count
- Mapping from binary correctness to SM-2 quality scale

**Review Scheduling:**
- Questions shuffle randomly when multiple cards are due
- Next review date calculation based on current performance
- Progressive difficulty through increasing intervals
- Tracking of repetition streaks for mastered content

### Database Schema

**Questions Table:**
- Stores quiz questions with 4 multiple-choice options
- Fields: id, question text, options array, correct answer index, category
- UUID primary keys

**Review Cards Table:**
- One-to-one relationship with questions
- SM-2 algorithm parameters: ease factor, interval, repetitions
- Temporal tracking: next review date, last review date
- Default values: ease factor 2.5, interval 0, repetitions 0

**Design Rationale:**
- Separation of static question content from dynamic learning state
- Allows same question to be reviewed by multiple users (future multi-user support)
- Efficient querying of due cards without joining large question tables

### Data Flow

**Quiz Session:**
1. Frontend requests due questions via React Query
2. Backend queries review cards with `nextReviewDate <= now`
3. Questions shuffled and returned to frontend
4. User submits answer with correctness boolean
5. Backend converts correctness to SM-2 quality score
6. SM-2 algorithm calculates new review parameters
7. Review card updated with new schedule
8. Frontend invalidates queries to refresh data

**Question Upload:**
1. User uploads JSON or pastes content in Upload page
2. Frontend validates against Zod schema
3. Bulk question creation in backend storage
4. Review cards automatically created for each question
5. Statistics queries invalidated to reflect new content

## External Dependencies

**UI Component Libraries:**
- Radix UI: Headless accessible component primitives (dialogs, popovers, tooltips, etc.)
- shadcn/ui: Pre-styled component implementations of Radix primitives
- Lucide React: Icon library for consistent iconography

**Database & ORM:**
- Drizzle ORM: TypeScript-first ORM for type-safe database queries
- Drizzle Kit: Database migration and schema management tool
- @neondatabase/serverless: PostgreSQL driver for Neon serverless database

**Validation & Type Safety:**
- Zod: Runtime type validation and schema definition
- drizzle-zod: Integration between Drizzle schemas and Zod validators
- TypeScript: Compile-time type checking across full stack

**Utilities:**
- date-fns: Date manipulation and formatting
- class-variance-authority: Type-safe CSS class variants
- clsx & tailwind-merge: Conditional className composition

**Development Tools:**
- Vite: Fast development server and build tool
- tsx: TypeScript execution for Node.js
- esbuild: Fast JavaScript bundler for production builds
- Replit-specific plugins for runtime error handling and development features

**Data Fetching:**
- TanStack Query (React Query): Declarative data fetching and caching
- Native Fetch API for HTTP requests

**Fonts:**
- Google Fonts: Playfair Display and Inter font families loaded via CDN