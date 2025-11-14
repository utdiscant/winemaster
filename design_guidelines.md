# Design Guidelines: Wine Spaced Repetition Quiz Application

## Design Approach

**Selected Framework**: Material Design with wine industry aesthetic refinement
**Rationale**: Educational utility tool requiring clear information hierarchy, immediate feedback patterns, and data visualization, enhanced with sophisticated wine-themed visual language.

**Core Principles**:
- Clarity over decoration - learning efficiency is paramount
- Elegant simplicity reflecting wine culture sophistication
- Immediate visual feedback for quiz interactions
- Data-driven progress visualization

## Typography System

**Font Families**:
- Primary (Headings): Playfair Display (serif) - elegant, wine label aesthetic
- Secondary (Body/UI): Inter (sans-serif) - excellent readability for quiz content

**Hierarchy**:
- Page Titles: text-4xl/5xl font-semibold (Playfair Display)
- Section Headers: text-2xl/3xl font-medium (Playfair Display)
- Quiz Questions: text-xl/2xl font-medium (Inter)
- Answer Options: text-base/lg font-normal (Inter)
- Body Text: text-sm/base font-normal (Inter)
- Stats/Metrics: text-3xl/4xl font-bold (Inter) for numerical data

## Layout System

**Spacing Primitives**: Tailwind units of 3, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card gaps: gap-4 to gap-6
- Page margins: px-4 md:px-8

**Container Strategy**:
- Max content width: max-w-4xl (quiz focused, not wide)
- Cards: rounded-lg with subtle elevation
- Full-width progress bars and statistics panels

## Component Library

### Navigation
- Simple top bar with app logo/name (left), statistics summary (center), settings icon (right)
- Bottom navigation on mobile for Quiz/Progress/Upload sections

### Quiz Interface
**Question Card**:
- Large, centered card (max-w-3xl)
- Question number badge (top-left corner)
- Question text: prominent, centered, generous line-height
- Difficulty indicator: subtle visual marker (grape cluster icons: 1-5)

**Answer Options**:
- Grid layout: grid-cols-1 md:grid-cols-2 with gap-4
- Each option as full-width button card with:
  - Letter prefix (A, B, C, D) in circle badge
  - Answer text left-aligned with padding
  - Hover state: subtle lift effect
  - Selected state: border accent
  - Correct/Incorrect states: immediate visual feedback (green checkmark/red X icons)

**Quiz Controls**:
- Progress indicator at top: linear progress bar showing X/Y questions
- Submit answer button (primary, prominent)
- Next question button (appears after answer submission)
- Skip/flag for review option

### Progress Dashboard
**Statistics Cards Grid**: grid-cols-1 md:grid-cols-3
- Total Questions Mastered (number + percentage)
- Questions Due Today (with urgency indicator)
- Current Streak (days)

**Review Calendar Heatmap**:
- 7-day week grid showing activity
- Intensity shading for questions reviewed per day

**Question Status Lists**:
- Tabs: Due Now / Learning / Mastered
- Each item shows: question preview, difficulty, next review date, success rate

### Upload Interface
**File Drop Zone**:
- Large dashed border container
- Center-aligned upload icon (cloud with arrow)
- "Drop JSON file here or click to browse" text
- File validation feedback

**JSON Preview Panel**:
- Code-style display of uploaded structure
- Question count summary
- Import confirmation button

### Feedback & Notifications
- Toast notifications (top-right): Success/Error messages
- Inline validation: Real-time for JSON format
- Confetti animation: On milestone achievements (10, 50, 100 questions mastered)

## Data Visualization

**Spaced Repetition Timeline**:
- Horizontal timeline showing upcoming review dates
- Stacked bars for question quantities per date
- Interactive hover revealing question details

**Performance Charts**:
- Success rate line graph over time
- Pie chart: Questions by difficulty level
- Bar chart: Category performance (if questions have categories)

## Responsive Behavior

**Mobile (< 768px)**:
- Single column layouts throughout
- Answer options stack vertically
- Statistics cards stack
- Bottom navigation bar
- Larger touch targets (min 44px)

**Desktop (>= 768px)**:
- Two-column answer grid
- Side-by-side statistics
- Expanded navigation with text labels
- Hover states and tooltips

## Images

**Hero Section**: No traditional hero - immediately show quiz or dashboard
**Decorative Elements**:
- Wine-related icon set from Heroicons or custom wine glass/grape/barrel SVG illustrations
- Subtle background pattern (optional): vineyard rows or wine bottle silhouettes at very low opacity as page background texture

## Animations

**Use Sparingly**:
- Answer selection: Quick scale feedback (scale-95 to scale-100)
- Correct/Incorrect: Gentle shake animation for wrong answers
- Card transitions: Smooth fade between questions
- Progress updates: Animated number counters
- Milestone celebrations: Confetti burst (using canvas-confetti library)

**No Animations**: Page transitions, scrolling effects, background animations

## Accessibility

- High contrast text throughout
- Clear focus states on all interactive elements
- Keyboard navigation: Arrow keys for answer selection, Enter to submit
- Screen reader announcements for quiz feedback
- Skip to quiz content link

This design balances educational utility with wine culture sophistication - clean, focused, and elegantly purposeful.