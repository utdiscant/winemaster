# Wine Master - Multi-User Spaced Repetition Quiz Application

## Overview
Wine Master is a multi-user web application for mastering wine knowledge through spaced repetition. It offers personalized quizzes, tracks progress, and uses the SM-2 algorithm for optimized learning. The platform features multi-user authentication, shared and admin-managed question databases, and real-time learning analytics. The project aims to be an effective, engaging, and accessible tool for wine education, targeting enthusiasts, students, and professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology:** React with TypeScript, Vite, Wouter, TanStack Query, Radix UI (shadcn/ui), Tailwind CSS.
- **Design:** Material Design principles with a wine-themed aesthetic, custom Tailwind configuration, HSL-based color variables, and mobile-first responsive design.
- **Structure:** Page-based routing with a single authentication guard, conditional routing based on user roles, shared UI components, and custom hooks.
- **State Management:** TanStack Query for API data fetching, caching, and invalidation; local component state for UI interactions.

### Backend
- **Technology:** Node.js with TypeScript, Express.js, Drizzle ORM, PostgreSQL (Neon serverless), Replit Auth (Passport.js with OIDC), `connect-pg-simple` for session storage.
- **API Design:** RESTful endpoints under `/api`, protected by `isAuthenticated` and `isAdmin` middleware. Includes request/response logging and error handling.
- **Key Endpoints:** Public authentication endpoints; protected endpoints for quiz, statistics, curricula, and user settings; admin-only endpoints for question management and user administration.
- **Storage:** PostgreSQL with Drizzle ORM, optimized queries, bulk inserts, transactions, and automatic/lazy review card provisioning.
- **Spaced Repetition:** Implements the SM-2 algorithm for calculating ease factor, interval, and repetitions based on user ratings. Questions are shuffled, and next review dates are calculated progressively.
- **Database Schema:**
    - `Users`: `id`, `email`, `name`, `is_admin`, `selected_curricula`.
    - `Questions`: `id`, `question`, `options`, `correct_answer`, `correct_answers`, `question_type` ('single', 'multi', 'text-input', 'map'), `category`, `curriculum`, `region_name`, `region_polygon`. Supports upsert by `id`.
    - `Review Cards`: `id`, `user_id`, `question_id`, `ease_factor`, `interval`, `repetitions`, `next_review_date`, `last_review_date` (unique on `(user_id, question_id)`).
    - `Sessions`: Managed by `connect-pg-simple`.
    - `Tasting Notes`: Stores wine profiles for blind tasting.
    - `Blind Tasting Sessions`: Tracks user blind tasting sessions.
- **Data Flow:**
    - **Quiz:** Frontend requests due questions, backend queries based on `nextReviewDate`, user answers, backend updates review card via SM-2, frontend queries invalidated.
    - **Question Upload:** Admin uploads JSON, frontend validates, backend handles bulk upsert, clears associated review cards, and invalidates statistics.
- **Features:**
    - **Admin User Management:** Admins can view and delete users (excluding themselves).
    - **Map-Based Questions:** Supports 'map' question type (GeoJSON polygons) with random display modes (click-to-identify or name-the-region). Includes interactive maps, visual feedback, MultiPolygon support, automatic zoom/center, and centroid markers.
    - **Performance Optimizations:** Reduced DB queries for answer submission and quiz loading, optimized session endpoint.
    - **Daily Question Limit:** Implements a 20-question daily goal with progress tracking, allowing users to continue beyond the goal.
    - **Blind Taste Simulator:** Interactive feature with progressive clues (Appearance, Nose, Palate) and elimination gameplay. Users eliminate wines until only the target remains.

## External Dependencies
- **UI Components:** Radix UI, shadcn/ui, Lucide React.
- **Database:** Drizzle ORM, Drizzle Kit, @neondatabase/serverless.
- **Validation:** Zod, drizzle-zod.
- **Utilities:** date-fns, class-variance-authority, clsx, tailwind-merge.
- **Development:** Vite, tsx, esbuild.
- **Data Fetching:** TanStack Query, Native Fetch API.
- **Fonts:** Google Fonts (Playfair Display, Inter).
- **Maps:** React Leaflet, Leaflet, OpenStreetMap tiles.