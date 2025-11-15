# Wine Master - Multi-User Spaced Repetition Quiz Application

## Overview

Wine Master is a multi-user web-based educational application that uses spaced repetition algorithms to help users master wine knowledge. Users authenticate via Replit Auth (Google, GitHub, or email/password) and receive personalized quiz questions about wine regions, grape varieties, winemaking techniques, and other wine-related topics. Using the SM-2 (SuperMemo 2) algorithm, the app intelligently schedules question reviews based on individual user performance to optimize long-term retention.

**Key Features:**
- Multi-user authentication via Replit Auth with session persistence
- Individual progress tracking with per-user review cards
- Shared question database accessible to all users
- Admin-only question management (upload, edit, delete)
- Intelligent spaced repetition scheduling using SM-2 algorithm
- Real-time progress statistics and learning analytics

## User Preferences

Preferred communication style: Simple, everyday language.

## Development Quick Login

For easier testing in development mode, the application includes quick login shortcuts:

**Landing Page Dev Buttons:**
- "Login as Admin" - Creates/logs in as test admin (admin@winemaster.dev) with full privileges
- "Login as User" - Creates/logs in as test user (user@winemaster.dev) with standard access

**How to Use:**
1. Run the app in development mode (`npm run dev`)
2. Visit the landing page - you'll see dev login buttons below "Get Started"
3. Click either button to instantly login without OAuth
4. Logout and switch between users as needed for testing

**Security:**
- Dev endpoints only work when `NODE_ENV=development`
- Production builds automatically exclude dev login UI
- Test users: `dev-admin-user` and `dev-regular-user`

## Recent Changes (November 2025)

**Multi-User Migration:**
- Implemented Replit Auth integration with Google, GitHub, and email/password providers
- Migrated from in-memory storage to PostgreSQL database with Drizzle ORM
- Created per-user review card system with unique(userId, questionId) constraint
- Built admin-only question management interface
- Implemented single router-level authentication guard (removed redundant per-page redirects)
- Optimized backend queries using JOINs and bulk inserts
- Added automatic review card provisioning on login and lazy provisioning in quiz endpoints
- Added dev-mode quick login for easy testing (admin and regular user)

**Multi-Select Question Support:**
- Added support for multi-select questions (6 options, 0-6 correct answers)
- Backend scoring requires exact set matching for full credit
- Quiz UI shows checkboxes for multi-select, radio buttons for single-choice
- Upload page accepts both "type" and "questionType" field names for compatibility
- Admin page displays question type badges and disables editing for multi-select
- Backward compatible with existing single-choice questions

**Delete All Questions Feature:**
- Added admin-only "Delete All Questions" button to admin page
- Confirmation dialog shows total question count before deletion
- Backend endpoint deletes all review cards and questions atomically
- Success message displays count of deleted questions
- Button only visible when questions exist

**Curriculum Field (November 2025):**
- Added optional `curriculum` field to questions table (e.g., "WSET1", "WSET2", "WSET3")
- Backend supports curriculum filtering via query parameter on `/api/quiz/due?curriculum=WSET1`
- Quiz page displays curriculum selector dropdown when curriculums are available
- Selecting a curriculum filters quiz questions to only show that curriculum
- Admin page displays curriculum field for each question
- Admin page includes curriculum filter dropdown alongside category filter
- Upload page supports curriculum field in JSON uploads
- Backward compatible - existing questions without curriculum continue to work

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
- Page-based routing: Landing, Quiz, Progress, Upload (admin), Admin (admin)
- Single router-level authentication guard in App.tsx
- Conditional routing and navigation based on user role (admin/non-admin)
- Shared UI components from shadcn/ui in `client/src/components/ui/`
- Custom hooks: useAuth for authentication state
- Global navigation component with role-based menu items

**State Management Strategy:**
- TanStack Query for API data fetching and caching with credentials: "include"
- Public `/api/auth/user` endpoint returns user object or null (no 401 loops)
- Query invalidation on data mutations (e.g., after uploading questions)
- Local component state for UI interactions (e.g., quiz answer selection)
- No redundant per-page auth redirects (centralized in router)

### Backend Architecture

**Technology Stack:**
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **ORM**: Drizzle ORM with snake_case schema
- **Database**: PostgreSQL (via Neon serverless)
- **Authentication**: Replit Auth (passport.js with OIDC strategy)
- **Session Storage**: PostgreSQL via connect-pg-simple

**API Design:**
- RESTful API endpoints under `/api` prefix
- Authentication middleware: isAuthenticated for protected routes
- Admin middleware: isAdmin for question management
- Request/response logging middleware
- Error handling with appropriate HTTP status codes

**Public Endpoints:**
- `GET /api/auth/user` - Returns user object or null (no auth required)
- `GET /api/login` - Initiates Replit Auth OAuth flow
- `GET /api/callback` - OAuth callback handler
- `GET /api/logout` - Destroys session and redirects

**Protected Endpoints:**
- `GET /api/quiz/due` - Retrieve questions due for current user
- `POST /api/quiz/answer` - Submit answer and update user's review schedule
- `GET /api/statistics` - Retrieve current user's progress statistics

**Admin-Only Endpoints:**
- `POST /api/questions/upload` - Bulk upload questions from JSON
- `PATCH /api/questions/:id` - Edit existing question
- `DELETE /api/questions/:id` - Delete question and related review cards
- `GET /api/questions` - List all questions (admin page)

**Storage Layer:**
- PostgreSQL-based DatabaseStorage implementation
- Optimized JOIN queries for performance (getDueCardsWithQuestions)
- Bulk insert operations with conflict handling
- Automatic review card provisioning: on login + lazy in quiz endpoints
- Transactions for data consistency

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

**Users Table (snake_case):**
- `id` VARCHAR PRIMARY KEY - from OIDC sub claim
- `email` TEXT NOT NULL
- `name` TEXT - concatenated firstName + lastName
- `is_admin` BOOLEAN DEFAULT false - admin role flag

**Questions Table (snake_case):**
- `id` VARCHAR PRIMARY KEY
- `question` TEXT NOT NULL
- `options` TEXT[] NOT NULL - exactly 4 options
- `correct_answer` INTEGER NOT NULL - index 0-3
- `category` TEXT - e.g., "Grapes", "Regions", "Techniques"

**Review Cards Table (snake_case):**
- `id` VARCHAR PRIMARY KEY
- `user_id` VARCHAR REFERENCES users(id) - per-user progress
- `question_id` VARCHAR REFERENCES questions(id)
- `ease_factor` REAL DEFAULT 2.5 - SM-2 algorithm parameter
- `interval` INTEGER DEFAULT 0 - days until next review
- `repetitions` INTEGER DEFAULT 0 - consecutive correct answers
- `next_review_date` TIMESTAMP - when card becomes due
- `last_review_date` TIMESTAMP - last answered time
- **UNIQUE CONSTRAINT**: (user_id, question_id) - prevents duplicate cards

**Sessions Table:**
- Managed by connect-pg-simple for session persistence
- Stores serialized session data and expiration

**Design Rationale:**
- Separation of users, questions, and individual progress tracking
- Questions are shared app-wide; review cards are per-user
- Unique constraint ensures each user has exactly one card per question
- Snake_case column names for PostgreSQL convention
- Optimized for multi-user concurrent access

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