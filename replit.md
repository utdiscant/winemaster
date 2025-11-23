# Wine Master - Multi-User Spaced Repetition Quiz Application

## Overview

Wine Master is a multi-user web application designed to help users master wine knowledge using spaced repetition. It offers personalized quizzes, tracks individual progress, and uses the SM-2 algorithm to optimize learning. The platform supports multi-user authentication via Replit Auth, provides shared and admin-managed question databases, and delivers real-time learning analytics. The business vision is to provide an effective, engaging, and accessible tool for wine education, targeting enthusiasts, students, and professionals alike.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:** React with TypeScript, Vite, Wouter for routing, TanStack Query for server state, Radix UI primitives with shadcn/ui for UI components, and Tailwind CSS for styling.

**Design System:** Adheres to Material Design principles with a wine-themed aesthetic. Uses Playfair Display for headings and Inter for body text. Features a custom Tailwind configuration with HSL-based color variables and a mobile-first responsive design.

**Component Structure:** Implements page-based routing with a single router-level authentication guard in `App.tsx`. Conditional routing and navigation are based on user roles. Utilizes shared `shadcn/ui` components and custom hooks like `useAuth`.

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
- **Questions:** `id`, `question`, `options` (TEXT[]), `correct_answer` (INTEGER), `correct_answers` (INTEGER[]), `question_type` ('single', 'multi', 'text-input', or 'map'), `category`, `curriculum` (optional for filtering), `region_name` (TEXT, for map questions), `region_polygon` (JSONB, GeoJSON format for map questions). Supports upserting via `id` field.
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

**Maps:** React Leaflet, Leaflet, OpenStreetMap tiles.

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

**Map-Based Question Type (November 2025):**
- Added support for 'map' question type that randomly displays as either click-to-identify or name-the-region during training
- **Text-to-Map Mode:** Users click on a map to identify wine regions; backend validates with point-in-polygon checking
- **Map-to-Text Mode:** Users see a highlighted region on map and type its name; supports fuzzy text matching
- Display mode is randomly chosen when quiz loads a map question, avoiding duplicate polygon data storage
- Schema updates: Added `region_name` (TEXT) and `region_polygon` (JSONB, GeoJSON format) to Questions table
- Made `options` column nullable to support map questions (which use acceptedAnswers array instead)
- Created reusable `WineMap` component using React Leaflet for interactive maps with zoom, pan, and click handling
- Backend validation: Accepts `displayMode` parameter ('text-to-map' or 'map-to-text') to validate based on how question was shown
- Quiz page: Renders interactive maps with visual feedback for correct/incorrect answers in both modes
- Upload page: Updated examples and preview to support combined map question type with GeoJSON polygon format
- Admin page: Displays region information and polygon status for map questions
- Map-based questions can only be edited via JSON upload due to complex polygon data requirements

**Map Display Improvements (November 20, 2025):**
- **Tile Layer:** Switched from CartoDB Voyager no-labels to Voyager with labels (shows countries, regions, and major cities)
- **Answer Feedback:** Correct region polygon now displays for both correct AND incorrect answers in text-to-map mode (previously only showed for incorrect answers)
- **Map Reset:** Added ViewResetter component with imperative Leaflet API to reset map view between questions
  - Text-to-map mode: Zoom level 4 centered on Europe (48.0, 10.0) for exploration
  - Map-to-text mode: Zoom level 6 centered on the specific region polygon for focused identification
  - Memoized center/zoom values prevent unnecessary map resets during user interaction (e.g., typing in map-to-text input)
- **Polygon Validation:** Added minimum 3-coordinate validation before rendering polygons to handle malformed GeoJSON data
- Backend returns `{ regionName, regionPolygon }` in `correctAnswer` field for map questions to support polygon display
- WineMap component uses `useMemo` hooks to optimize rendering and prevent flicker during state updates

**Map Visual Enhancements (November 22, 2025):**
- **Center Marker:** Added green pin marker at the centroid of correct regions for text-to-map mode
  - Makes it easier to locate the correct region on the map after answering
  - Uses `getPolygonCentroid()` utility to calculate bounds center from all coordinates
  - Green marker rendered using CSS hue-rotate filter on default Leaflet marker
- **Automatic Zoom/Center:** Map automatically fits to show both user's click and correct region when answer is revealed
  - Uses `getBoundsForPolygonAndPoint()` utility to calculate bounds including all polygon vertices plus user's clicked point
  - Leaflet's `fitBounds()` API with 60px padding provides ~10-15% visual buffer
  - Smooth 0.5s animation with maxZoom:8 to prevent over-zooming
  - One-time fit allows users to pan/zoom freely after initial reveal
  - Bounds reset when moving to next question
- **MultiPolygon Support:** Full support for MultiPolygon wine regions (e.g., islands, disjoint areas)
  - Created `normalizeGeoJSONCoordinates()` utility that extracts coordinates from both Polygon and MultiPolygon geometries
  - WineMap component renders all parts of MultiPolygon regions separately
  - Bounds calculation includes all polygon parts for proper auto-fitting
  - Centroid calculated from bounds center of all coordinates (reliable for complex geometries)
  - Map-to-text mode displays all parts of MultiPolygon for identification
  - Text-to-map mode feedback shows all parts of correct MultiPolygon answer
  - Note: Interior rings (polygon holes) are not currently rendered but are accounted for in bounds/centroid calculations

**Combined Map Question Type (November 23, 2025):**
- Consolidated separate 'text-to-map' and 'map-to-text' types into single 'map' type
- Random display mode selection happens on quiz page load, not in database
- Eliminates data duplication: single map question can train both click-to-identify and name-the-region skills
- Schema: `question_type = 'map'` with `region_name`, `region_polygon`, and `acceptedAnswers` fields
- Backend accepts `displayMode` parameter ('text-to-map' or 'map-to-text') in answer submissions for proper validation
- Frontend randomly chooses display mode per question using `Math.random()` in useEffect hook
- All existing map features (MultiPolygon, auto-zoom, centroid markers) work seamlessly in both modes

**Performance Optimizations (November 22, 2025):**
- **Answer Submission:** Optimized from 3 sequential DB queries to 1 combined JOIN query
  - Created `getQuestionWithReviewCard()` method that fetches question and review card in single query
  - Removed expensive `ensureUserReviewCards()` call from answer submission hot path
  - Added lazy fallback: creates missing review cards only when needed (shouldn't happen in normal flow)
- **Quiz Loading:** Removed `ensureUserReviewCards()` from `/api/quiz/due` endpoint
  - Review cards now only created during login/auth callback
  - Significantly faster question fetching
- **Session Endpoint:** Kept `/api/auth/user` as O(1) user lookup without expensive operations
  - No longer calls `ensureUserReviewCards()` on every page load
- **Expected Performance:** Answer submission and next question fetch should be 2-3x faster

**Daily Question Limit (November 23, 2025):**
- Implemented 20-question daily goal to prevent overwhelming users with too many reviews
- **Progress Tracking:** Uses existing `last_review_date` field to count reviews completed today
- **Backend Changes:**
  - Added `getReviewsCompletedToday()` storage method to count reviews from today (respects curriculum filters)
  - Modified `/api/quiz/due` endpoint to return `{ questions, dailyProgress }` with `completedToday`, `dailyGoal`, and `totalDue`
  - Updated `getDueCardsWithQuestions()` to sort by `next_review_date` (earliest first = highest priority)
  - Updated Statistics schema and endpoint to include `completedToday` field
- **Frontend UI:**
  - Daily goal card displays "X / 20" progress with progress bar
  - Green "Goal Complete!" badge appears when 20 questions answered
  - Congratulatory message encourages continuing with remaining due questions
  - Users can continue practicing beyond daily goal - no hard limit enforced
  - Separate session progress bar shows current quiz session progress
- **Design Philosophy:** Daily goal creates manageable learning chunks while allowing motivated users to continue