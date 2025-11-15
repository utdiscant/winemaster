# Wine Master - Multi-User Spaced Repetition Quiz Application

## Overview

Wine Master is a multi-user web application designed to help users master wine knowledge using spaced repetition. It offers personalized quizzes, tracks individual progress, and uses the SM-2 algorithm to optimize learning. The platform supports multi-user authentication via Replit Auth, provides shared and admin-managed question databases, and delivers real-time learning analytics. The business vision is to provide an effective, engaging, and accessible tool for wine education, targeting enthusiasts, students, and professionals alike.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:** React with TypeScript, Vite, Wouter for routing, TanStack Query for server state, Radix UI primitives with shadcn/ui for UI components, and Tailwind CSS for styling.

**Design System:** Adheres to Material Design principles with a wine-themed aesthetic. Uses Playfair Display for headings and Inter for body text. Features a custom Tailwind configuration with HSL-based color variables and a mobile-first responsive design.

**Component Structure:** Implements page-based routing with a single router-level authentication guard in `App.tsx`. Conditional routing and navigation are based on user roles. Utilizes shared `shadcn/ui` components and custom hooks like `useAuth`. Includes specialized components like `MapQuestion` for map-based quiz questions.

**State Management Strategy:** TanStack Query handles API data fetching and caching, including authentication credentials. Query invalidation is used for data mutations. Local component state manages UI interactions.

### Backend Architecture

**Technology Stack:** Node.js with TypeScript, Express.js, Drizzle ORM, PostgreSQL (via Neon serverless), Replit Auth (using passport.js with OIDC), and `connect-pg-simple` for session storage.

**API Design:** RESTful API endpoints under `/api`, protected by `isAuthenticated` middleware and `isAdmin` middleware for administrative functions. Includes request/response logging and robust error handling.

**Key Endpoints:**
- **Public:** `/api/auth/user`, `/api/login`, `/api/callback`, `/api/logout`
- **Protected:** `/api/quiz/due`, `/api/quiz/answer`, `/api/statistics`, `/api/curricula`, `/api/user/curricula` (GET and PATCH)
- **Admin-Only:** `/api/questions/upload` (supports upsert by ID), `/api/questions/:id` (PATCH and DELETE), `/api/questions` (GET all)

**Storage Layer:** PostgreSQL-based `DatabaseStorage` with Drizzle ORM. Optimizes queries with JOINs, uses bulk inserts, and ensures data consistency with transactions. Features automatic and lazy review card provisioning.

### Spaced Repetition Algorithm

**SM-2 Implementation:** Incorporates SM-2 algorithm to calculate ease factor, interval, and repetitions based on user-submitted quality ratings (0-5). Failed reviews reset scheduling parameters.

**Review Scheduling:** Questions are shuffled when multiple are due. Next review dates are calculated progressively to increase difficulty.

### Database Schema

**Key Tables:**
- **Users:** `id`, `email`, `name`, `is_admin`, `selected_curricula` (TEXT[] for filtering questions).
- **Questions:** `id`, `question`, `options` (TEXT[]), `correct_answer` (INTEGER), `correct_answers` (INTEGER[]), `question_type` ('single', 'multi', or 'map'), `category`, `curriculum`, `map_region_name`, `map_country`, `map_latitude`, `map_longitude`, `map_zoom`, `map_variant` (optional map-specific fields). Supports upserting via `id` field.
- **Review Cards:** `id`, `user_id`, `question_id`, `ease_factor`, `interval`, `repetitions`, `next_review_date`, `last_review_date`. Enforces a unique constraint on `(user_id, question_id)`.
- **Sessions:** Managed by `connect-pg-simple`.

**Design Rationale:** Clear separation of users, questions, and per-user progress. Questions are shared globally, while review cards track individual learning. Uses snake_case for PostgreSQL convention and is optimized for multi-user access.

### Data Flow

**Quiz Session:** Frontend requests due questions, backend queries based on `nextReviewDate`, questions are returned, user answers, backend updates review card via SM-2 algorithm, and frontend queries are invalidated.

**Question Upload:** Admin uploads JSON. Frontend validates via Zod. Backend handles bulk creation or updating of questions (upsert by ID) and clears associated review cards if questions are updated. Statistics queries are invalidated.

## External Dependencies

**UI Component Libraries:** Radix UI, shadcn/ui, Lucide React (icons).

**Database & ORM:** Drizzle ORM, Drizzle Kit, @neondatabase/serverless.

**Validation & Type Safety:** Zod, drizzle-zod, TypeScript.

**Utilities:** date-fns, class-variance-authority, clsx, tailwind-merge.

**Development Tools:** Vite, tsx, esbuild.

**Data Fetching:** TanStack Query, Native Fetch API.

**Fonts:** Google Fonts (Playfair Display, Inter).

## Recent Features

**Admin User Overview (November 2025):**
- Added `/users` page for admins to view all registered users
- Displays table with name, email, and user type (Admin/User badge)
- Shows total user count below the table
- Backend endpoint: GET `/api/users` (admin-only)
- Proper loading and empty states with data-testid attributes for testing
- Navigation includes Users link for admin users only

**User Deletion (November 2025):**
- Admin users can delete other users from the database
- Delete button added to each user row in the Users page
- Confirmation dialog prevents accidental deletions
- Users cannot delete themselves (delete button disabled for current user)
- Backend endpoint: DELETE `/api/users/:id` (admin-only)
- Deletes all user's review cards before deleting the user
- Proper error handling for nonexistent users (returns 404)
- Backend prevents self-deletion attempts (returns 400 error)

**Map Question Type (November 2025):**
- Added 'map' question type alongside 'single' and 'multi' questions
- Embeds worldwineregions.com public domain map with specified coordinates
- Two variants: 'location-to-name' (show map, type region name) and 'name-to-location' (show name, view location)
- Schema fields: `map_region_name`, `map_country`, `map_latitude`, `map_longitude`, `map_zoom`, `map_variant`
- Case-insensitive text answer validation with trimming
- MapQuestion component displays iframe with interactive wine region map
- Example Mosel (Germany) map question created for testing
- Upload endpoint supports map questions via JSON with regionName, country, latitude, longitude, zoom, and variant fields