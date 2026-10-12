# Software Requirements Specification
## For SecondHelping

Version 0.2  
Prepared by Geming Wu  
Student from Beihang  
2026/10/12

## Table of Contents
* [1. Introduction](#1-introduction)
  * [1.1 Document Purpose](#11-document-purpose)
  * [1.2 Product Scope](#12-product-scope)
  * [1.3 Definitions, Acronyms, and Abbreviations](#13-definitions-acronyms-and-abbreviations)
  * [1.4 References](#14-references)
  * [1.5 Document Overview](#15-document-overview)
* [2. Product Overview](#2-product-overview)
  * [2.1 Product Perspective](#21-product-perspective)
  * [2.2 Product Functions](#22-product-functions)
  * [2.3 Product Constraints](#23-product-constraints)
  * [2.4 User Characteristics](#24-user-characteristics)
  * [2.5 Assumptions and Dependencies](#25-assumptions-and-dependencies)
  * [2.6 Apportioning of Requirements](#26-apportioning-of-requirements)
* [3. Requirements](#3-requirements)
  * [3.1 External Interfaces](#31-external-interfaces)
  * [3.2 Functional Requirements](#32-functional-requirements)
  * [3.3 Quality of Service](#33-quality-of-service)
  * [3.4 Compliance](#34-compliance)
  * [3.5 Design and Implementation](#35-design-and-implementation)
  * [3.6 AI/ML](#36-aiml)
* [4. Verification](#4-verification)
* [5. Appendices](#5-appendices)

## Revision History

| Name | Date | Reason for changes | Version |
|------|------|--------------------|---------|
| Initial baseline | 2026/10/12 | Initial requirements baseline for the current prototype | 0.1 |
| Future AI expansion | 2026/10/12 | Added roadmap for predictive surplus, dynamic pricing, and food-circulation optimization | 0.2 |

## 1. Introduction
SecondHelping is a campus food-recovery and food-circulation application designed to reduce surplus food waste while helping students access low-cost meals before dining halls close. The current prototype is a reactive marketplace in which supervisors post closing-bag listings and students reserve remaining meals. The future product direction, described in this document, extends the system from a simple rescue marketplace into an autonomous campus food-circulation network that predicts surplus before it happens, prevents avoidable waste, routes remaining food to its next best use, and measures environmental and social impact.

### 1.1 Document Purpose
This Software Requirements Specification (SRS) describes the functionality and constraints of SecondHelping at two maturity levels: the current operational prototype and the planned future AI-driven system. The document is intended for product stakeholders, developers, testers, and campus operators who need a shared understanding of what the system must do and how future improvements connect to the present product. It defines the product behavior, constraints, and verification expectations without describing a single implementation strategy.

### 1.2 Product Scope
The current system scope includes role-based login, student browsing, dining-hall listing creation, reservation flow, pickup confirmation, and summary reporting. The planned future scope adds predictive surplus forecasting, prep optimization, AI-assisted listing creation, dynamic pricing, route-based food redistribution, and environmental impact estimation. The system may therefore evolve from a closing-bag marketplace into a broader campus circular-economy platform.

The in-scope features for the near term are: student and supervisor user accounts, listing publication, allergen-aware filtering, order management, pickup code confirmation, and operational metric dashboards. Out-of-scope items for the current phase include integrated payment processing, full supply-chain optimization, and advanced autonomous decision-making across multiple campuses.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|------------|
| AI | Artificial intelligence used for forecasting and decision support. |
| Dining Hall | A campus food-service location that publishes meal listings and manages food recovery. |
| Listing | A meal or closing-bag offer containing information such as price, quantity, allergens, and pickup window. |
| Order | A reservation created when a student claims a listing. |
| Pickup Code | A unique code that supports meal validation when a reservation is picked up. |
| SRS | Software Requirements Specification. |
| Student | A user role that browses available meals, reserves food, and collects pickup codes. |
| Supervisor | A user role responsible for listing meals, confirming pickup, and monitoring operations. |
| UI | User Interface. |
| VLM | Vision-Language Model for image-based meal or inventory recognition. |

### 1.4 References

| Title | Author/Owner | Version/Date | Type | Location |
|------|--------------|--------------|------|----------|
| Next.js Documentation | Vercel | Current | Informative | https://nextjs.org/docs |
| Prisma Documentation | Prisma | Current | Informative | https://www.prisma.io/docs |
| PostgreSQL Documentation | PostgreSQL Global Development Group | Current | Informative | https://www.postgresql.org/docs/ |

### 1.5 Document Overview
Section 2 describes the product context and expected evolution from a reactive marketplace to a predictive and autonomous food-circulation system. Section 3 defines the requirements for current functionality and future AI-driven enhancements. Section 4 specifies verification criteria for prototype and roadmap components, while Section 5 includes supporting appendices and operational notes.

## 2. Product Overview
### 2.1 Product Perspective
SecondHelping is a new campus food-recovery product designed to tackle the operational problem of surplus food near closing time. In its current form, it is a web application that helps dining-hall staff publish discounted meals and allows students to find and reserve food before it is discarded. The next product direction reframes the system as an autonomous campus food-circulation network that predicts surplus before it happens, reduces avoidable waste, reroutes what remains, and tracks societal and environmental impact.

The system depends on a central relational database, a web-based interface, and role-based operational workflows. The current prototype is self-contained and uses Next.js, Prisma, and PostgreSQL. Future AI modules can be layered on top of that foundation using prediction, optimization, multimodal input processing, dynamic pricing, and routing logic without replacing the underlying transaction infrastructure.

### 2.2 Product Functions
The current product provides the following core functions:

- Student registration and login.
- Role-based access to the student and supervisor dashboards.
- Listing publication with price, discount, quantity, pickup timing, and allergens.
- Student browsing and filtering by dining hall and allergen preferences.
- Meal reservation and inventory reduction.
- Pickup-code generation and pickup confirmation.
- Metrics for rescued meals, saved money, and order totals.

The planned future product provides additional functions:

- Predictive surplus forecasting from sales, menu patterns, weather, and campus events.
- Prep optimization to reduce overproduction before excess food appears.
- AI-assisted listing creation from photos or voice input.
- Dynamic pricing based on inventory, time left, and fairness rules.
- Rescue routing to food banks, shelters, staff meal channels, or compost streams.
- Real-time impact estimation for meals diverted, carbon avoided, and water saved.

### 2.3 Product Constraints
The system shall operate under the following constraints:

- The current product must use the existing web stack based on Next.js, React, TypeScript, Prisma, and PostgreSQL.
- The system must preserve secure session-based access and role-based authorization.
- User passwords must not be stored in plaintext.
- The solution shall remain usable by standard web browsers and shall not depend on a mobile app in the initial release.
- AI-based future features must incorporate human oversight and fairness protections when price or allocation decisions affect students or community recipients.

### 2.4 User Characteristics
The primary user groups are:

1. Students: they want simple access to affordable meals, clear pickup information, and a frictionless booking flow.
2. Dining-hall supervisors: they need a quick way to publish closing bags, monitor reservations, and confirm meal pickup.
3. Campus operations staff and administrators: they need visibility into food recovery rates, operational trends, and impact metrics.
4. Future AI operators and analysts: they will monitor model predictions, pricing recommendations, and routing suggestions to ensure the system remains fair and effective.

### 2.5 Assumptions and Dependencies
The current and future product depends on the following assumptions:

- PostgreSQL remains available for persistent application data.
- The project continues to operate in a campus dining environment with a manageable number of dining halls and user roles.
- Product data such as menu records, sales history, ingredient usage, and reservation behavior will be available for forecasting and analytics when the AI features are introduced.
- Supervisor assignments and dining-hall mappings remain valid for listing publication and pickup operations.
- External solution components, such as event data, menu metadata, or routing services, may be added later through APIs or internal services.

If these assumptions fail, predictive features and routing decisions may need manual fallback behavior or reduced automation.

### 2.6 Apportioning of Requirements

| Requirement area | Current version | Future version |
|------------------|-----------------|----------------|
| User access | Login, signup, role-based route guards | Same plus privilege-aware AI operations |
| Listing management | Publish, view, filter, reserve | AI-assisted listing creation and optimization |
| Inventory control | Quantity tracking and reservation logic | Predictive prep reduction and surplus forecasting |
| Pricing | Fixed discount model | Dynamic, fairness-constrained pricing |
| Routing | Manual pickup confirmation | Rescue router for pantry, shelter, and compost paths |
| Analytics | Saved meals and order totals | CO₂e, water, waste, and social-impact calculations |

## 3. Requirements
### 3.1 External Interfaces
#### 3.1.1 User Interfaces
The application shall provide browser-based web interfaces for all user roles. The current system includes login, signup, student marketplace, and dining-hall dashboard views. Future interfaces may include AI dashboards, forecasting outputs, pricing recommendation panels, and food-routing status views.

- The login page shall allow an authenticated user to access the correct dashboard.
- The signup page shall create a student account with valid email and password validation.
- The student dashboard shall display available listings and a pickup code after reservation.
- The supervisor dashboard shall allow publication of new listings and confirmation of pickup.
- Future AI dashboards shall show forecast confidence, recommended prep changes, pricing suggestions, and impact metrics to campus operators.

#### 3.1.2 Hardware Interfaces
The system shall run on standard laptop and desktop hardware connected to the internet using a modern browser. The proposed AI features may require additional computational resources, but they are not required for the baseline version.

#### 3.1.3 Software Interfaces
The application shall integrate with the following technical interfaces:

- Next.js runtime and App Router for server rendering and route handling.
- PostgreSQL for persistent data storage.
- Prisma ORM for schema management and data access.
- Browser client interfaces for form actions and user interaction.
- Optional future AI services for forecasting, multimodal input analysis, pricing optimization, and routing decisions.

### 3.2 Functional Requirements

- ID: REQ-FUNC-001  
  Title: User login  
  Statement: The system shall allow a registered user to sign in with an email and password and shall route the user to the appropriate dashboard based on role.  
  Rationale: Current product operation depends on authenticated access and role separation.  
  Acceptance Criteria: Valid credentials redirect to the correct dashboard; invalid credentials show an error and remain on the login page.  
  Verification Method: Demonstration

- ID: REQ-FUNC-002  
  Title: Student registration  
  Statement: The system shall allow a user to create a student account with a valid email, name, and password that meets the minimum length requirement.  
  Acceptance Criteria: Successful signup creates a new student account and redirects to the student page; duplicate emails are rejected.  
  Verification Method: Test

- ID: REQ-FUNC-003  
  Title: Role-based access control  
  Statement: The system shall enforce authorization so that student role cannot access the wrong dashboard without redirection.  
  Acceptance Criteria: Students cannot access the supervisor dashboard.  
  Verification Method: Test

- ID: REQ-FUNC-004  
  Title: Listing publication  
  Statement: The system shall allow a supervisor to publish a listing with title, quantity, price, discount, allergens, and pickup window.  
  Acceptance Criteria: Valid data is stored and the listing becomes visible to students when active.  
  Verification Method: Demonstration

- ID: REQ-FUNC-005  
  Title: Listing filtering  
  Statement: The system shall allow students to filter active listings by dining hall and allergen preferences.  
  Acceptance Criteria: Listings containing excluded allergens are hidden from the results list.  
  Verification Method: Test

- ID: REQ-FUNC-006  
  Title: Reservation management  
  Statement: The system shall create an order when a student reserves an active listing and shall decrement remaining quantity to prevent overbooking.  
  Acceptance Criteria: A reservation succeeds only if stock remains; once inventory is exhausted, the listing is marked sold out or unavailable.  
  Verification Method: Test

- ID: REQ-FUNC-007  
  Title: Pickup confirmation  
  Statement: The system shall generate a unique pickup code for each order and shall allow supervisors to confirm pickup for the correct dining hall.  
  Acceptance Criteria: A pickup code is visible to the student and a matching order can be changed to PICKED_UP when the code is scanned.  
  Verification Method: Demonstration

- ID: REQ-FUNC-008  
  Title: Operational summary reporting  
  Statement: The system shall display operational summaries for rescued meals, savings, and order totals.  
  Acceptance Criteria: The merchant dashboard updates aggregate metrics based on valid order and listing records.  
  Verification Method: Analysis

- ID: REQ-FUNC-009  
  Title: Predictive surplus engine  
  Statement: The future system shall predict anticipated surplus food before it occurs using historical sales, menu data, weather, campus events, and operational context.  
  Rationale: This shifts the product from rescue after waste to prevention before waste is created.  
  Acceptance Criteria: The system generates expected leftover portions, probability of surplus, and a confidence estimate for each meal type or dining-hall session.  
  Verification Method: Analysis

- ID: REQ-FUNC-010  
  Title: Prep copilot and digital twin  
  Statement: The future system shall allow a supervisor to simulate prep-level trade-offs and estimate the impact of reducing or moving meal preparation quantities.  
  Acceptance Criteria: The system produces a recommended prep adjustment scenario and the projected surplus reduction for alternative operations.  
  Verification Method: Demonstration

- ID: REQ-FUNC-011  
  Title: Multimodal listing assistant  
  Statement: The future system shall support image or voice input for listing creation and shall convert the input into a structured listing with suggested discount, pickup time, and item description.  
  Acceptance Criteria: A user can upload a photo or provide spoken input, and the system proposes a valid listing draft with review before publication.  
  Verification Method: Demonstration

- ID: REQ-FUNC-012  
  Title: Dynamic pricing agent  
  Statement: The future system shall personalize discounts based on time remaining, demand, inventory, and fairness constraints rather than using a single static rate.  
  Acceptance Criteria: The pricing engine proposes a recommended price or discount range while respecting maximum fairness caps and operational objectives.  
  Verification Method: Analysis

- ID: REQ-FUNC-013  
  Title: Rescue routing  
  Statement: The future system shall recommend the next-best destination for unsold meals, such as a pantry, shelter, staff meal, or compost stream.  
  Acceptance Criteria: The system assigns a recommended disposition path and associated routing details based on food condition, destination feasibility, and operational constraints.  
  Verification Method: Demonstration

- ID: REQ-FUNC-014  
  Title: Impact estimator  
  Statement: The future system shall estimate meals rescued, diverted food weight, CO₂e avoided, water and land savings, and student savings for each order or operational cycle.  
  Acceptance Criteria: The system displays a breakdown of social and environmental impact for rescued food and related transactions.  
  Verification Method: Analysis

### 3.3 Quality of Service
#### 3.3.1 Performance
The current prototype shall support normal browsing, reservation, and confirmation operations within acceptable campus-scale response times. For future AI features, prediction and optimization tasks shall be available within a practical operational window (for example, within the time between meal planning and service start) without blocking critical user interactions.

#### 3.3.2 Security
The application shall enforce authenticated sessions and role-based access. Passwords shall be hashed, and session tokens shall be protected from plaintext exposure. Future AI components shall ensure that pricing and routing suggestions are not based on sensitive student data beyond what is required for operational fairness and service quality.

#### 3.3.3 Reliability
The system shall maintain consistent inventory and order status by using transactional database updates. Future AI services shall be accompanied by fallback logic so that if forecasting or pricing recommendations are unavailable, the system can revert to a safe default mode without losing core marketplace functionality.

#### 3.3.4 Availability
The current platform shall be available during expected operating periods. For AI features, the product shall support degraded operation so that listing creation, reservations, and pickup confirmation remain functional even when predictive services are temporarily unavailable.

### 3.4 Compliance
The system shall handle student and staff account data responsibly. It must store only the minimum user information necessary for authentication, authorization, and service delivery. Any future AI features must consider privacy, fairness, and explainability requirements before making pricing or redistribution decisions that affect community members.

### 3.5 Design and Implementation
The system shall continue to use a layered architecture with clear separation between user interface, service logic, and persistence. The current data model includes User, DiningHall, Listing, Order, and AuthSession; future AI features can extend this model with prediction outputs, pricing policies, routing records, and impact metrics.

### 3.6 AI/ML
The future product direction includes the following AI modules:

1. Predictive Surplus Engine
   - Inputs: POS sales, menu data, recipes, weather, campus events, class schedules, historical waste, day-of-week patterns, exam periods, and holidays.
   - Outputs: expected leftovers, probability of surplus, confidence intervals, and recommended prep reductions.

2. Prep Copilot + Digital Twin
   - Simulates how reducing prep quantities or shifting meal availability changes surplus outcomes.
   - Uses forecasting, simulation, and optimization logic.

3. Multimodal Listing Copilot
   - Accepts photos or spoken descriptions of leftover dishes and transforms them into listing drafts automatically.
   - Supports a faster listing flow with structured item recognition and discount recommendation.

4. Dynamic Pricing Agent
   - Uses contextual pricing to balance student savings, waste reduction, merchant outcomes, and fairness constraints.
   - The system shall enforce fairness caps to avoid price exploitation.

5. Rescue Router
   - Recommends the next best destination for unsold food, such as pantry, shelter, staff use, another campus kitchen, or composting.
   - Optimizes routing and volunteer logistics in a circular-economy flow.

6. Impact Estimator
   - Measures meals rescued, kilograms diverted, CO₂e avoided, water saved, and student savings.
   - Provides a real-time account of impact for each transaction or operational cycle.

The AI components shall include human review for any decision that materially affects pricing, donation destination, or large-scale operational commitments.

## 4. Verification
Verification shall be performed at two levels: the current prototype and the future AI extension. Current requirements shall be tested through functional validation, demonstration, and inspection. Future AI features shall be validated through model evaluation, operational review, and fairness checks in addition to functional testing.

- Prototype requirements shall be verified by login, reservation, pickup, and dashboard workflows.
- AI forecasting requirements shall be evaluated on accuracy, confidence calibration, and operational usefulness.
- Pricing recommendations shall be reviewed for fairness, transparency, and avoidance of exploitative behavior.
- Routing recommendations shall be checked against destination feasibility and campus operational constraints.
- Impact calculations shall be validated against transaction data and environmental assumptions.

## 5. Appendices
### Appendix A: Current core routes

| Route | Description |
|-------|-------------|
| `/` | Login page |
| `/signup` | Student account creation |
| `/student` | Marketplace, listing filtering, reservations, and pickup codes |
| `/merchant` | Supervisor dashboard for listing publication and pickup confirmation |

### Appendix B: Current data model summary

- User: identity, role, dining hall assignment, authentication, and session relationships.
- DiningHall: dining location and associated supervisors/listings.
- Listing: meal offer with price, quantity, allergens, and pickup schedule.
- Order: reservation and pickup confirmation state.
- AuthSession: hashed session token with expiry tracking.

### Appendix C: Future AI roadmap summary

- Sense → Predict → Prevent → Price → Personalize → Pickup → Prove → Learn
- Multi-objective optimization across food recovery, student access, campus sustainability, and operational ease.
- Human oversight remains required for any high-impact allocation or pricing decision.

### Appendix D: Local development commands

```bash
pnpm install
docker compose up -d
pnpm prisma migrate deploy
pnpm prisma generate
pnpm prisma db seed
pnpm dev
```