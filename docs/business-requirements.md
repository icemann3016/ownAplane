# Business Requirements — ownAplane

> **Status:** Draft v0.4 · 2026-10-08 · Owner: Zlati · v0.2: flight log (BKG-7, BKG-12…16) · v0.3: subscriptions (SUB, §5.11, §8) · v0.4: API for apps and partners (API, §5.12), calendar sync (SYN, §5.13)
> **Purpose:** The single source of truth for *what* we are building and *why*. Claude reads this before building any feature.
> **How to change it:** Edit it in a PR like any other code. Add new ideas under [§11 Parking lot](#11-parking-lot-ideas-for-later).

---

## 1. Vision

A single marketplace for **general aviation (GA) in Europe** that connects the people who fly, own, maintain and host light aircraft:

- **Pilots** find and book a rental aircraft in minutes instead of phoning around clubs.
- **Owners** earn from their aircraft when they're not flying it, and control who can fly it.
- **Technicians** find maintenance work from owners nearby.
- **Airports** take requests online for prior permission (PPR), parking, hangars and services instead of by email or phone.

**Trust is the product.** Verified licences, two-way ratings and clear aircraft status are what make an owner comfortable handing over the keys.

## 2. Goals & success metrics

| Goal | Metric (first 12 months after MVP launch) |
|------|-------------------------------------------|
| Supply: enough aircraft to be useful | ≥ 50 listed aircraft in the launch country |
| Demand: pilots actually book | ≥ 200 completed bookings |
| Trust: bookings go well | Average rating ≥ 4.5 / 5; < 2% bookings with a dispute |
| Retention | ≥ 40% of pilots who complete one booking make a second within 90 days |

_Numbers are placeholders to refine together._

## 3. Scope & phases

| Phase | Scope | Why this order |
|-------|-------|----------------|
| **Phase 1 — MVP** | Accounts & roles, pilot verification, aircraft listings, search & availability, booking requests with a flight log (times, fuel, oil, remarks), ratings & rental requirements, messaging, basic admin | The core two-sided marketplace. Everything else builds on these accounts, aircraft and ratings |
| **Phase 2 — Maintenance** | Technician profiles, service catalogue, quote requests, maintenance jobs, maintenance blocks on the aircraft calendar | Owners from Phase 1 are the customers for technicians |
| **Phase 3 — Airports** | Airport profiles, PPR requests, parking/hangar requests, ground services, customs requests | Pilots from Phase 1 are the customers for airports |
| **Phase 4 — Payments** | In-app payments, deposits, payouts, platform commission | Deliberately postponed. See §8 |
| **API & calendar sync** (next) | Versioned REST API for a mobile app and partner systems; calendar sync with other booking systems so an aircraft is never double-booked | A mobile app is planned, and aircraft are often also booked elsewhere (clubs, Google Calendar). See §5.12 and §5.13 |
| **Subscriptions** (not scheduled) | Free / Owner / Fleet plans for owners, billing through a payment provider | Planned for the future, not built yet. Can start any time after launch, before Phase 4. See §5.11 and §8 |

**MVP payments decision:** In Phase 1 the app shows prices and confirms bookings, but **no money moves through the platform**. Pilots pay owners directly (bank transfer, cash, club account). See §8.

## 4. Users & roles

One person has **one account** and can hold **several roles** at once. Zlati can be a pilot and an owner at the same time. A technician can also be a pilot.

| Role | Can do | Phase |
|------|--------|-------|
| **Pilot** | Browse and book aircraft, rate owners/aircraft, request airport services | 1 (airport requests in 3) |
| **Owner** | Everything a pilot can, plus list aircraft, set rental rules, approve bookings, rate pilots, hire technicians | 1 (hiring in 2) |
| **Technician** | Offer maintenance services, send quotes, manage jobs. Can be an individual or a maintenance organisation | 2 |
| **Airport operator** | Manage an airport profile, approve PPR, parking, hangar and service requests | 3 |
| **Admin** (us) | Verify documents, moderate reviews, handle disputes, suspend accounts | 1 |

**Organisations:** Flying clubs, flight schools, maintenance organisations and airports are usually companies with several staff. From Phase 2 an account can belong to an **organisation** with multiple members. In the MVP an owner is a single person.

## 5. Functional requirements

Format: **ID** · user story · acceptance criteria. Priority: **M** = must (in phase), **S** = should, **C** = could.

### 5.1 Accounts & profiles (ACC) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| ACC-1 | M | As a user I can sign up with email + password or Google/Apple/Facebook, and verify my email. |
| ACC-2 | M | As a user I can switch on roles (pilot, owner) from my profile without creating a new account. |
| ACC-3 | M | My public profile shows name, photo, home airfield, roles, member-since date, verified badges and rating summary. Private data (documents, phone, email) is never public. |
| ACC-4 | M | I can delete my account and export my data (GDPR). |
| ACC-5 | S | I can choose language (EN first, BG next) and units (kg/lb, L/USG). |

### 5.2 Pilot verification (VER) — Phase 1

Owners need to know who's flying their aircraft. Verification is the trust foundation.

| ID | Pri | Requirement |
|----|-----|-------------|
| VER-1 | M | As a pilot I can upload my **licence** (e.g. PPL(A), LAPL(A), CPL, ATPL), issuing state, number and expiry. |
| VER-2 | M | I can add my **class/type ratings** (SEP land, MEP, TMG, specific types) with expiry dates, and **privileges** (night, IR, etc.). |
| VER-3 | M | I can upload my **medical certificate** (Class 1/2/LAPL) with expiry. Medical data is shown to owners only as "valid until <date>", never the document itself. |
| VER-4 | M | I can enter **flight experience**: total hours, PIC hours, hours in the last 90 days, hours per type. Self-declared in MVP, marked as such. |
| VER-5 | M | An admin reviews uploaded documents and marks each as **verified / rejected**. The pilot sees the status and reason. |
| VER-6 | M | The system warns me 30 days before any document expires and **blocks new bookings** when a licence, rating or medical needed for that aircraft has expired. |
| VER-7 | C | Import hours from a digital logbook (later). |

### 5.3 Aircraft listings (LST) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| LST-1 | M | As an owner I can list an aircraft with: **registration**, manufacturer & model, year, category (aeroplane, TMG, ultralight/microlight, helicopter), seats, engine, fuel type (AVGAS 100LL, UL91, MOGAS, Jet A-1), fuel burn, cruise speed, useful load, endurance. |
| LST-2 | M | I can describe **equipment**: avionics (e.g. G1000, GTN), autopilot, transponder/ADS-B, VFR / night VFR / IFR capability. |
| LST-3 | M | I can add **photos** (at least 1, up to 20) and a free-text description. |
| LST-4 | M | I can set the **home base** (ICAO code, e.g. LBSF) from an airport list. |
| LST-5 | M | I can set **pricing**: price per hour, **wet or dry** (fuel included or not), **how time is measured** (Hobbs, tach, or block time), currency, optional minimum hours per day and weekend price. |
| LST-6 | M | I can upload **aircraft documents** for admin verification: Certificate of Airworthiness, Airworthiness Review Certificate (ARC) with expiry, insurance certificate with expiry. Owners see expiry reminders. An aircraft with an expired ARC or insurance is **automatically unlisted**. |
| LST-7 | M | I can set the aircraft to **listed / paused / unlisted**. |
| LST-8 | S | I can upload the **POH/AFM extract, checklists and weight & balance data** for renters to read before the flight. |
| LST-9 | C | Co-owners: several owners share one aircraft listing and its calendar. |

### 5.4 Search & availability (SRC) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| SRC-1 | M | As a pilot I can search aircraft by **location** (airport or radius around a point) and **date/time range**, and see only aircraft that are free then. |
| SRC-2 | M | I can filter by category, seats, price range, wet/dry, IFR/night capability, avionics, and **"I meet the requirements"** (only aircraft whose rental rules I satisfy, see §5.6). |
| SRC-3 | M | Results show photo, model, registration, home base, price per hour, rating and distance. Map and list views. |
| SRC-4 | M | The aircraft page shows full specs, photos, the owner's profile & rating, rental requirements, cancellation policy and an **availability calendar**. |
| SRC-5 | M | As an owner I manage the **calendar**: my own flights, maintenance blocks, and unavailable periods. Bookings appear automatically. |
| SRC-6 | S | I can save favourite aircraft and saved searches with alerts. |

### 5.5 Booking (BKG) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| BKG-1 | M | As a pilot I can **request a booking** for a time slot, with purpose (local flight, cross-country, etc.), planned destination(s) and number of passengers. The system checks the rental requirements before I can send it. |
| BKG-2 | M | The request shows an **estimated price** (hours × rate, plus fuel if dry). It clearly says payment is arranged directly with the owner (MVP). |
| BKG-3 | M | As an owner I receive the request and can **accept, decline or propose another time** within a response window (default 24 h, then it expires). |
| BKG-4 | S | As an owner I can enable **instant booking** for pilots who meet my requirements **and** have flown my aircraft before. |
| BKG-5 | M | A requested slot is held (not double-bookable) until the owner responds or it expires. Accepted bookings block the calendar. |
| BKG-6 | M | Either side can **cancel**. The owner's cancellation policy (free until X hours before) is shown at booking time. Late cancellations are recorded on the profile. |
| BKG-7 | M | **Flight log (check-out / check-in):** Every booking has a flight log. At check-out the pilot records the start readings (Hobbs/tach), fuel and oil on board, optionally with photos. During and after the rental the pilot logs each leg (BKG-12), fuel and oil (BKG-13, BKG-14) and remarks or defects (BKG-15). At check-in the pilot submits the log and the owner confirms it or asks for a correction. The confirmed log gives the **final flown time** on the aircraft's time basis (Hobbs, tach or block time, LST-5) and the **amount due**. |
| BKG-8 | M | A defect reported in the flight log (or at any time) notifies the owner immediately. The owner can mark the aircraft **grounded**, which blocks future bookings until cleared. |
| BKG-9 | M | Both parties get notifications (email + in-app, push later) for request, accept, decline, reminder 24 h before, and check-in. |
| BKG-10 | S | The owner can require a **checkout flight with an instructor** before a pilot's first solo rental. |
| BKG-11 | C | Weather/NOTAM links for the booked route on the booking page. |
| BKG-12 | M | **Legs and times:** A flight log has one or more legs (e.g. LBSF → LBPD → LBSF). For each leg: departure and arrival airport, **block off / block on** and **engine start / stop** times, optional take-off and landing times, number of landings, and Hobbs/tach at start and end. Times are stored in UTC and shown in airport-local time with UTC alongside. The pilot can fill it in on a phone right after landing, save it as a draft and finish it later. |
| BKG-13 | M | **Fuel:** fuel on board before and after each leg (in the pilot's units; fuel type from the aircraft). **Refuelling** entries: airport, quantity, fuel type, price paid, receipt photo, and who paid (pilot or owner's account). On a wet rate, fuel the pilot paid for is subtracted from the amount due; on a dry rate, fuel the owner supplied is added. |
| BKG-14 | M | **Oil:** oil level before and after the flight (as read on the dipstick) and **oil added** (quantity, grade). The owner sees the aircraft's oil use per engine hour over time, an early sign of engine problems. |
| BKG-15 | M | **Remarks & PIREPs:** after each flight the pilot can add remarks about the aircraft that aren't defects (e.g. "left mag drop 150 rpm", "COM2 scratchy") and optional notes on weather or the airfield. Defects follow BKG-8. The owner sees all remarks in the aircraft's history and can mark one as a **known item** that later renters see before they fly. |
| BKG-16 | S | **Aircraft usage history:** from confirmed flight logs the owner sees hours flown, landings, fuel and oil used per aircraft, per month and per pilot, and can export them (CSV). These hours drive the maintenance reminders in TEC-8. The pilot can export their own legs for their logbook. |

> The flight log is a record between the pilot and the owner. It doesn't replace the aircraft's official journey log or technical log (Part-ML), or the pilot's logbook; the app says so on the log.

### 5.6 Ratings & rental requirements (RAT) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| RAT-1 | M | After a **completed** booking, the pilot rates the **aircraft & owner**, and the owner rates the **pilot**. 1–5 stars plus an optional comment. |
| RAT-2 | M | Pilot ratings cover: airmanship/care of aircraft, punctuality, communication, condition returned. Aircraft/owner ratings cover: aircraft condition (matches listing), communication, value. The overall score is the average. |
| RAT-3 | M | **Double-blind:** Neither side sees the other's review until both have submitted or 14 days have passed. This prevents retaliation. |
| RAT-4 | M | Only people who completed a booking together can review each other. One review per side per booking. |
| RAT-5 | M | The owner can reply publicly once to a review. Either side can **report** a review. Admins can hide reviews that break the rules (abuse, personal data), but not just because they're negative. |
| RAT-6 | M | As an owner I can set **rental requirements** per aircraft: **minimum pilot rating** (e.g. ≥ 4.0), licence types accepted, required class/type rating, minimum total hours, minimum hours on type, minimum hours in last 90 days, night/IR privilege for night/IFR flights, minimum age. |
| RAT-7 | M | New pilots have **no rating yet**. The owner chooses whether pilots with no rating (or fewer than N reviews) can request, e.g. "allow if they do a checkout flight first". |
| RAT-8 | M | A pilot who doesn't meet the requirements sees **which** requirement fails ("Requires ≥ 50 h on type, you have 12 h") and can't send a request. |
| RAT-9 | S | Technicians (Phase 2) and airports (Phase 3) also get rated, using the same system. |

### 5.7 Messaging & notifications (MSG) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| MSG-1 | M | Pilot and owner can message inside the app, linked to a booking or listing. |
| MSG-2 | M | Phone numbers and emails are shared only **after** a booking is accepted. |
| MSG-3 | M | Notification settings per channel (email, in-app, push later). |

### 5.8 Admin & trust (ADM) — Phase 1

| ID | Pri | Requirement |
|----|-----|-------------|
| ADM-1 | M | Admin queue to verify pilot documents and aircraft documents. |
| ADM-2 | M | Admin can suspend users, unlist aircraft, hide reviews, and see an audit log of these actions. |
| ADM-3 | M | Users can report a user, listing, review or message. Reports go to the admin queue. |
| ADM-4 | S | Basic dashboard: sign-ups, listings, bookings, cancellations, disputes. |

### 5.9 Maintenance marketplace (TEC) — Phase 2

| ID | Pri | Requirement |
|----|-----|-------------|
| TEC-1 | M | As a technician I create a profile as an **individual** (e.g. Part-66 licence, category B1, B2, B3 or L, with aircraft groups) or an **organisation** (e.g. Part-145, Part-CAO, Part-CAMO approval number). Admin verifies the licence/approval. |
| TEC-2 | M | I publish a **service catalogue** from standard items: 50 h check, 100 h / annual inspection, oil change, ELT battery replacement, avionics installation, pitot-static/transponder check, compass swing, propeller work, engine overhaul coordination, weight & balance, airworthiness review (ARC), defect rectification, pre-purchase inspection, plus custom items. Each has a price (fixed, hourly or quote only). |
| TEC-3 | M | I set my **service area**: base airport(s), whether I travel to the aircraft, and the aircraft types I work on. |
| TEC-4 | M | As an owner I can search technicians by location, service and aircraft type, and **request a quote** for my aircraft (aircraft details pre-filled). |
| TEC-5 | M | The technician sends a quote with price, estimated duration and available dates. The owner accepts. A **maintenance job** is created and the aircraft calendar is **blocked** for that period. |
| TEC-6 | M | Job status: requested → quoted → accepted → in progress → completed. The technician can attach work reports. |
| TEC-7 | M | **Important:** The app does **not** replace official maintenance records or the Certificate of Release to Service (CRS). Those stay in the aircraft's logbooks and continuing airworthiness records. The app can store a copy. |
| TEC-8 | S | **Maintenance due reminders:** The owner enters the hours/dates of the last inspections. The app uses the hours from confirmed flight logs (BKG-7, BKG-16) to warn "50 h check due in 6 h" and suggests nearby technicians. |
| TEC-9 | S | Owners and technicians rate each other after a completed job. |

### 5.10 Airport services (APT) — Phase 3

| ID | Pri | Requirement |
|----|-----|-------------|
| APT-1 | M | As an airport operator I claim or create my **airport profile**: ICAO code, runways, opening hours, radio frequencies, whether PPR is required, fees (landing, parking, hangar), available services, contacts. Admin verifies I represent the airport. |
| APT-2 | M | As a pilot I can send a **PPR (prior permission required) request**: aircraft (from my booking or entered), date, ETA/ETD, origin/destination, persons on board, purpose. |
| APT-3 | M | In the same request I can ask for **apron parking or a hangar** (with dates) and **services**: fuel (type & quantity), handling, tie-downs, catering, transport, and **customs/immigration** when arriving from or departing to a non-Schengen country or outside the EU customs area. |
| APT-4 | M | The operator approves, declines or approves with conditions (e.g. a different slot), and can add a PPR number. The pilot gets notified. |
| APT-5 | M | **Important:** A PPR is administrative permission from the airport operator. It does **not** replace ATC clearance, flight plan filing, or official customs/border notification procedures. The app must say this clearly. |
| APT-6 | S | The operator sees a daily list of expected arrivals, departures and parked aircraft. |
| APT-7 | C | The pilot can attach the PPR to an aircraft booking so the whole trip is in one place. |

### 5.11 Subscriptions (SUB) — future, not scheduled

Owners pay for growth and convenience; **pilots are always free**. Plans and prices are in [§8](#8-business-model--payments).

| ID | Pri | Requirement |
|----|-----|-------------|
| SUB-1 | M | Every account has a **plan**: Free (default), Owner or Fleet. Limits and features per plan are defined in one place in the code; prices live with the payment provider. |
| SUB-2 | M | **Safety and trust are never paid features:** pilot verification, eligibility checks, defects and grounding, flight log, reviews, messages and reports work the same on every plan. |
| SUB-3 | M | Plan limits are **enforced in the database** (e.g. listing an aircraft beyond the plan's limit is refused), like the listing checks for LST-6. |
| SUB-4 | M | As an owner I see my plan, what I use ("2 of 3 aircraft") and when it renews under **Account → Plan & billing**, and can upgrade, change payment details or cancel there (the provider's hosted pages; the app never handles card data). |
| SUB-5 | M | A public **Pricing** page compares the plans, with prices **including VAT** for consumers. |
| SUB-6 | M | **Downgrade or non-payment never deletes data:** a 7-day warning first; then aircraft beyond the limit are unlisted (the owner picks which stay listed) and paid features stop. Accepted and upcoming bookings continue as normal. |
| SUB-7 | M | Admins can **give a plan for free** (founding owners, partners, testers) with an end date and see each member's plan in Admin → Members. Logged in the audit log. |
| SUB-8 | M | Payments, renewals, failed payments and cancellations reach the app through the provider's **webhook**; the app's plan always follows the provider. |
| SUB-9 | S | **Founding owners:** owners who list an aircraft before a cut-off date get the Owner plan free for 12 months. |
| SUB-10 | S | Paid features: instant booking (BKG-4), full usage history and CSV exports, owner statistics (hours, earnings, busiest months), "Featured" (clearly labelled) spots in search, calendar link for Google/Outlook. |
| SUB-11 | C | Fleet features: co-managers who answer requests and manage the calendar; organisation page (club name, logo, its aircraft). |
| SUB-12 | C | Technician and airport plans in Phases 2–3. |

### 5.12 API for apps and partners (API) — next

The website, a future mobile app and partner systems all use **one backend**: the same validation,
permission checks and database rules. The website keeps rendering its pages on the server; apps and
partners use the REST API.

| ID | Pri | Requirement |
|----|-----|-------------|
| API-1 | M | A versioned **REST API** (`/api/v1`, JSON) for the mobile app and partner systems. It uses the same backend core as the website, so rules and permissions are identical everywhere. |
| API-2 | M | The app signs in with the same accounts (email and password; Google, Apple, Facebook) and gets a **token**, not a browser cookie. Signing out, "sign out everywhere" and a password change revoke tokens. The API accepts only tokens, never cookies (no cross-site request forgery). |
| API-3 | M | Everything a pilot or owner does on the website becomes available in the API, in this order: account and roles; airports; search, aircraft and availability with "can I rent this"; bookings (request, answer, cancel); flight log; messages; notifications; reviews; pilot credentials; aircraft management. |
| API-4 | M | Consistent conventions: errors as JSON with a stable `code` and the HTTP status; paged lists; times in ISO 8601 UTC; quantities in SI units (litres, kilograms, minutes), as stored. |
| API-5 | M | A machine-readable description (**OpenAPI**) at `/api/v1/openapi.json`, generated from the same validation schemas as the code so it can't drift. |
| API-6 | S | Limits per token (requests per minute) and API usage visible to admins. |
| API-7 | S | Push notifications to the app (the "push" channel of MSG-3). |
| API-8 | C | The API can run as its own service (separate deployment) without code changes, when traffic or the team needs it. |

### 5.13 Calendar sync with other booking systems (SYN) — next

Aircraft are often also booked elsewhere: a club or flight-school system, the owner's Google
Calendar, another platform. ownAplane must never accept a booking for time already taken there,
and the other system should see ownAplane bookings.

| ID | Pri | Requirement |
|----|-----|-------------|
| SYN-1 | M | The owner connects an aircraft to one or more other systems, whatever kind they are: by **iCal (ICS) link** (Google Calendar, Outlook, most club booking systems), by a simple **JSON link** (for custom systems), or by letting the system **push** its bookings (SYN-4). Their busy times block the aircraft in ownAplane like the owner's own blocks; pilots see only "busy", never names or notes. |
| SYN-2 | M | Connected calendars are refreshed regularly (target: every 15 minutes) **and again right before** a booking request is created or accepted for that aircraft. If a calendar can't be read, the owner is warned and the booking shows when the calendar was last checked. |
| SYN-3 | M | Every aircraft has a private **iCal export link** with its ownAplane bookings and blocks (busy times only, no personal data) for the other system to subscribe to. The owner can reset the link. |
| SYN-4 | M | Partner systems can **push** busy times in real time through the API (create, change, delete by their own id). The API refuses a time that overlaps an ownAplane booking (HTTP 409), so their system can refuse it too. Access with a key the owner creates per aircraft and can revoke. |
| SYN-5 | M | A **conflict** (an external booking arrives for time already booked in ownAplane) is never resolved silently: both stay visible, the owner is notified at once and decides which one to cancel. |
| SYN-6 | S | Outgoing notifications (**webhooks**) to partner systems when an ownAplane booking is created, changed or cancelled. |
| SYN-7 | C | Two-way integrations with specific systems that have their own API, as needed. |

## 6. Key business rules (summary)

1. One account, many roles.
2. You can't book an aircraft unless your licence, ratings and medical are valid for it on the booking dates **and** you meet the owner's requirements.
3. An aircraft can't be booked if it's grounded, paused, or has an expired ARC or insurance.
4. Only completed bookings or jobs can be reviewed. Reviews are double-blind.
5. MVP: the platform doesn't take or hold money.
6. The platform is a marketplace. The owner remains responsible for the aircraft's airworthiness, and the pilot-in-command remains responsible for the flight. Terms of service must say this.

## 7. Non-functional requirements

| Area | Requirement |
|------|-------------|
| **Privacy (GDPR)** | EU hosting. Medical certificates are health data (a special category under GDPR Art. 9): store encrypted, show only validity status, restrict admin access, log access. Privacy policy and consent at sign-up. |
| **Security** | Documents in private storage with signed URLs. Role-based access checks on every API. 2FA option for owners and airport operators. |
| **Platforms** | Responsive web app first (works well on phones at the airfield). Native apps later if needed. |
| **Time** | Store all times in UTC. Show local time of the airport, with UTC shown on booking and PPR screens (aviation standard). |
| **Aviation data** | Airport list from an open dataset (e.g. OurAirports) for ICAO codes, names and coordinates. |
| **Performance** | Search results in < 2 s. |
| **Availability** | 99.5% uptime target for MVP. |
| **Accessibility** | WCAG 2.1 AA for main flows. |
| **Languages** | English at launch, Bulgarian next, built for more. |

## 8. Business model & payments

**Phase 1 (off-platform):** No commission is possible because we don't handle payments. Options to decide on (open question Q3):

- Free during launch to build supply and demand, which is the most common marketplace approach.
- Owner subscription (e.g. monthly per listed aircraft) or featured listings.
- Technician and airport subscriptions in Phases 2–3.

**Proposed subscription plans (2026-10-02, not built yet; requirements in §5.11):**

| | **Free** | **Owner** | **Fleet** (clubs, schools, operators) |
|---|---|---|---|
| Price (suggested) | €0 | €15/month or €150/year | €49/month or €490/year |
| Listed aircraft | 1 | up to 3 | up to 15 |
| Booking requests, calendar, flight log, defects, reviews, messages | ✓ | ✓ | ✓ |
| Instant booking | – | ✓ | ✓ |
| Usage history and CSV exports | last 3 months | full | full |
| Owner statistics (hours flown, earnings, busiest months) | – | ✓ | ✓ |
| "Featured" spot in search (labelled) | – | 1 aircraft | 3 aircraft |
| Calendar link for Google/Outlook | – | ✓ | ✓ |
| Co-managers | – | – | ✓ |
| Organisation page | – | – | ✓ |

- **Pilots never pay.** They bring the bookings; one extra rental hour (≈ €150–200 for a C172) pays for the Owner plan.
- **Launch free:** everything is free during the beta; founding owners get the Owner plan free for 12 months (SUB-9). Charging starts once there is real use.
- **Payment provider (to decide):** a merchant of record (**Paddle** or Lemon Squeezy) handles EU VAT for consumers in every country (≈ 5% + €0.50 per payment); **Stripe Billing** is cheaper (≈ 1.5–2.5%) but we register for VAT OSS and file returns ourselves. Recommendation: Paddle for subscriptions; Stripe Connect stays the plan for Phase 4 payouts. Called with plain HTTP (no SDK) to keep the app portable.
- **Data:** a `subscriptions` table (user, plan, status, current period end, provider and its customer/subscription ids, granted-by-admin flag and end date) with RLS: users read only their own row; only the webhook and admins write.
- **Before charging (not code):** a company to receive the money (Q7), terms with subscription and refund rules incl. the EU 14-day right of withdrawal for consumers, prices shown with VAT.
- **Build order when we start:** S1 plans, limits and admin-given plans (no payments) → S2 Pricing page and Plan & billing page → S3 checkout, webhook and billing portal → S4 the paid features (SUB-10, SUB-11).

**Phase 4 (in-app payments):** Pilot pays through the app (e.g. via Stripe Connect), the platform keeps a commission, and the owner receives a payout. This also enables **security deposits**, automatic cancellation fees and protection for both sides. It needs KYC for payees and careful terms, which is why it comes later.

## 9. Regulatory & legal points to verify

_Not legal advice. Verify each point with an aviation lawyer and the national CAA (in Bulgaria: DG CAA) before launch._

- **Who is the operator** during a rental (normally the renting pilot, flying non-commercially) and whether any rental setup counts as a **commercial operation** that would need an AOC or other approval.
- **Insurance:** EU Regulation 785/2004 sets minimum liability insurance for aircraft operators. Confirm that the owner's policy covers **third-party renters** and what hull cover and excess apply. Consider requiring proof of cover per listing (LST-6).
- **Continuing airworthiness:** Under Part-ML/Part-M, the owner (or a contracted CAMO/CAO) is responsible for airworthiness. The platform only displays the status the owner provides.
- **Maintenance privileges:** Which tasks a technician may certify depends on their licence/approval and the aircraft. The platform shows credentials but doesn't decide who may certify what.
- **Cost-sharing flights** are regulated differently from rentals, so they are out of scope for now (see §11).
- **Terms of service, privacy policy, cookie policy** — needed before launch.

## 10. Key entities (for the data model)

`User` · `Role` · `PilotCredential` (licence, rating, medical) · `ExperienceRecord` · `Aircraft` · `AircraftDocument` · `RentalRequirements` · `Availability/CalendarBlock` · `Booking` · `FlightLog` (check-out/in) · `FlightLeg` · `Uplift` (fuel/oil added) · `Remark` · `Defect` · `Review` · `Message/Conversation` · `Report` · _API & sync:_ `ApiToken` · `ApiKey` · `ExternalCalendar` · `ExternalBusyTime` · `SyncConflict` · _Subscriptions:_ `Subscription` · _Phase 2:_ `TechnicianProfile` · `Organisation` · `ServiceOffering` · `QuoteRequest` · `MaintenanceJob` · `MaintenanceSchedule` · _Phase 3:_ `Airport` · `AirportService` · `AirportRequest` (PPR/parking/hangar/services)

## 11. Parking lot (ideas for later)

- **Flight instructor role:** checkout flights, rental with an instructor, a natural fit with BKG-10.
- **Flying clubs & schools:** organisation accounts with member-only aircraft and internal pricing.
- Digital **pilot logbook**, auto-filled from flight-log legs (BKG-12).
- Full aircraft **tech log** (deferred defects, CRS sign-off) and maintenance tracking, building on the flight log and defects (BKG-7…16).
- **Weather, NOTAM** and route planning integrations.
- **Cost-sharing** flights (regulated separately, needs research).
- **Aircraft sales / co-ownership** listings.
- Insurance offered per booking through a partner.
- Fuel price map.

## 12. Open questions

| # | Question | Owner |
|---|----------|-------|
| Q1 | ~~App name~~ **Decided: ownAplane** (2026-09-26). Logo and brand look still open. | Zlati + friend |
| Q2 | Launch country: Bulgaria only first, or a wider EU area? | |
| Q3 | Phase 1 revenue: free, subscription, or featured listings? **Proposed (2026-10-02):** free at launch, later owner subscriptions (Free / Owner / Fleet, §8, SUB). Open: final prices and limits, payment provider (Paddle vs Stripe). | Zlati |
| Q4 | Do we verify flight hours (logbook upload) or keep them self-declared with a label? | |
| Q5 | Which ultralight/microlight categories do we support? These are often nationally regulated, not EASA. | |
| Q6 | Who handles disputes (damage, no-shows) when no money passes through us? | |
| Q7 | Do we need a legal entity and insurance for the platform itself before launch? | |

## 13. Glossary

| Term | Meaning |
|------|---------|
| **GA** | General aviation — non-airline, non-military flying |
| **PIC** | Pilot in command |
| **PPL / LAPL** | Private Pilot Licence / Light Aircraft Pilot Licence (EASA) |
| **SEP / MEP** | Single-engine piston / multi-engine piston class rating |
| **IR** | Instrument rating |
| **Wet / dry rate** | Hourly price with / without fuel |
| **Hobbs / tach** | Meters that measure engine running time, used for billing |
| **Block time** | From block off (aircraft starts moving for the flight) to block on (stops at the end), used for billing and logbooks |
| **Engine time** | From engine start to engine stop |
| **Uplift** | Fuel or oil added to the aircraft |
| **PIREP / remark** | Pilot report after a flight: observations about the aircraft (and optionally weather or the airfield) |
| **Journey log / tech log** | The aircraft's official records of flights and defects, kept by the owner/operator |
| **ARC** | Airworthiness Review Certificate, usually valid for 1 year |
| **CofA** | Certificate of Airworthiness |
| **CRS** | Certificate of Release to Service, signed after maintenance |
| **Part-66** | EASA licence for maintenance technicians (categories A, B1, B2, B2L, B3, C, L) |
| **Part-145 / Part-CAO / Part-CAMO** | EASA approvals for maintenance / combined airworthiness / continuing airworthiness management organisations |
| **Part-ML** | EASA continuing airworthiness rules for light aircraft |
| **PPR** | Prior Permission Required — airport operator's permission to land/park |
| **ICAO code** | Four-letter airport identifier, e.g. LBSF (Sofia) |
| **Squawk / defect** | A fault found on the aircraft |
