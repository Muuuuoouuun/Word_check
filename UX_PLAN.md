# Words Check UX Plan

## Goal

This app should not feel like a test management tool.
It should feel like a calm, reliable English training system that helps 100 students:

- start quickly
- stay focused during tests
- know exactly what to review after tests
- build confidence from visible progress

The UX goal is simple:

`Reduce friction before the test, reduce distraction during the test, and increase action after the test.`

---

## Product Role

For a teacher and academy director, this app should be used in three ways:

1. Diagnostic use
At the beginning of a cycle, we use the app to identify each student's level and weak vocabulary patterns.

2. Daily habit use
On weekdays, students take short focused vocabulary tests for 5 to 10 minutes.

3. Weekly mastery use
At the end of the week, students take a cumulative review test and move directly into wrong-answer review.

The app should support all three without changing the student's mental model.
The core student experience should always be:

`Open -> Start -> Focus -> Submit -> Review -> Improve`

---

## UX Principles

### 1. One Clear Next Action
Students should never wonder what to do next.
Every screen should answer one question:

- before the test: "What should I start now?"
- during the test: "What should I answer now?"
- after the test: "What should I review now?"

### 2. Low Anxiety, High Clarity
Students who want to become good at English should feel supported, not judged.

- avoid crowded screens
- avoid too much red warning language
- avoid showing multiple priorities at once
- give short, actionable feedback instead of abstract evaluation

### 3. Small Wins Over Heavy Pressure
Students improve faster when the app makes progress feel reachable.

- short test sessions
- wrong answers grouped into small review sets
- visible streaks and growth moments
- progress framed as improvement, not failure

### 4. Teacher Sees Exceptions First
With 100 students, the teacher cannot manage everyone manually.
Teacher UX should highlight:

- who did not start
- who repeatedly misses the same type
- who needs intervention
- who is improving and can move up

### 5. Parent UX Should Be Minimal
Parents should see enough to trust the process, but not so much that the experience becomes stressful.

- completion status
- recent trend
- whether review is needed

---

## Primary User Flows

## Student Flow

### A. First Entry

Target feeling:
`I can get in right away.`

Required UX:

- one-tap entry or very short login
- persistent device login
- clear identity confirmation
- immediate landing on "today's task"

### B. Student Home

Target feeling:
`I know what matters today.`

Required UX:

- one primary card: today's most urgent test
- secondary list for upcoming or unfinished tasks
- simple progress summary
- no admin-like clutter

### C. Test Start

Target feeling:
`I can focus now.`

Required UX:

- dedicated focus screen
- single-question flow
- autosave reassurance
- visible but calm timer
- easy resume if interrupted

### D. Test Submission

Target feeling:
`I finished. Show me what I should do next.`

Required UX:

- result summary first
- correct/wrong count
- time spent
- immediate entry to wrong-answer review
- clear path to supplemental test if needed

### E. Wrong-Answer Review

Target feeling:
`I can recover quickly.`

Required UX:

- wrong answers grouped in small batches
- answer + meaning + context shown together
- "review complete" moments that feel rewarding
- return path to dashboard without confusion

---

## Teacher Flow

### A. Daily Management

Target feeling:
`I can see what needs attention in one glance.`

Required UX:

- dashboard sorted by urgency
- filters by class, level, due status, risk
- clear grouping for not-started, in-progress, missed, repeated wrong patterns

### B. Assignment Creation

Target feeling:
`I can assign work to many students quickly.`

Required UX:

- class-based or group-based assignment creation
- source and lesson range selection that is easy to scan
- preview of difficulty and word volume
- sensible defaults

### C. Review and Intervention

Target feeling:
`I know who needs help and why.`

Required UX:

- student-level weakness view
- repeated error type indicators
- simple intervention tools: reassign, supplement, extend, retry
- no deep navigation for common tasks

---

## Parent Flow

Target feeling:
`The child is studying steadily and the academy is managing it well.`

Required UX:

- weekly digest, not noisy daily spam
- finished / unfinished / review-needed status
- one short explanation of what comes next

---

## Screen Priority Plan

## Priority 1: Student Home

This is the most important screen in the product.
If the student home is unclear, everything feels heavier.

Strengthen:

- one dominant CTA
- today's task summary
- current streak or consistency indicator
- recent result card

## Priority 2: Focus Test Screen

This screen should feel quiet and trustworthy.

Strengthen:

- stronger visual separation from dashboard
- timer clarity without panic
- more obvious autosave state
- progress language that feels encouraging

## Priority 3: Result and Review Screens

This is where learning value becomes visible.

Strengthen:

- result summary that leads to action
- wrong-answer review in small chunks
- visible next step after completion

## Priority 4: Teacher Exception Dashboard

This is where scalability happens.

Strengthen:

- risk sorting
- group actions
- repeated mistake insights
- low-friction intervention tools

---

## UX Improvements To Introduce

## Student-Facing

### 1. Today's Task Mode
Only one main test should dominate the first screen.

### 2. Confidence Language
Replace cold labels with language that helps students keep moving.

Examples:

- "시험 시작" -> "지금 5분 집중하기"
- "오답 8개" -> "다시 보면 되는 단어 8개"

### 3. Recovery Design
After mistakes, the app should guide recovery immediately.

- wrong-answer note
- supplemental practice
- progress comparison with previous attempt

### 4. Motivation Layer
Light motivation only.

- streaks
- consistency badges
- weekly improvement highlight

### 5. Accessibility for Younger Learners

- larger touch targets
- clearer spacing
- simpler sentence length in interface copy
- color not used as the only status signal

## Teacher-Facing

### 1. Batch UX
Teacher should be able to assign by group, not one by one.

### 2. Exception Queue
Default teacher screen should emphasize students needing attention.

### 3. Pattern-Based Review
Show error trends by:

- lesson
- question type
- vocabulary theme
- student group

### 4. Fast Action Tools

- assign supplement
- reopen or extend
- mark offline completion
- resend login access

---

## What We Should Avoid

- too many numbers on the student home
- showing both dashboard complexity and test complexity together
- punishment-heavy wording
- deep teacher menus for common actions
- parent alerts that create anxiety without context
- visual designs that look like office software instead of a learning tool

---

## Rollout Roadmap

## Phase 1: Trust and Focus

Goal:
Make the product feel easy and safe to use.

Focus:

- simple entry
- clearer student home
- stronger focus test screen
- reliable submit and resume behavior

## Phase 2: Review Loop

Goal:
Turn every test into another learning chance.

Focus:

- richer result summary
- wrong-answer note flow
- supplemental practice handoff
- visible next-step guidance

## Phase 3: Motivation and Growth

Goal:
Help students feel momentum.

Focus:

- streaks
- weekly progress view
- improvement messaging
- class-level encouragement patterns

## Phase 4: Scale for 100 Students

Goal:
Make teacher operations sustainable.

Focus:

- class/group assignment UX
- exception dashboard
- fast intervention flows
- parent digest UX

---

## Success Criteria

We should evaluate the UX with learning behavior, not just feature completion.

Student success signals:

- more students start without help
- fewer abandoned tests
- more students complete wrong-answer review
- faster re-entry after interruption

Teacher success signals:

- less time spent assigning
- less time spent identifying who needs help
- more confidence in who to intervene with first

Parent success signals:

- fewer confusion messages
- better understanding of progress and next step

---

## Final Direction

If we do this well, the app will not feel like "online homework administration."
It will feel like:

`a calm daily English training routine that helps students improve without losing confidence.`
