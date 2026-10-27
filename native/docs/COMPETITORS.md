# Competitors

Survey date **2026-10-27**. Seven live products were reached from this machine.
Every claim is tagged with how it was obtained:

- **seen** — rendered on screen and captured in `competitor-shots/`.
- **listing** — the developer's own store or site copy. Not verified.
- **inferred** — a conclusion drawn from a screenshot, said so in place.

Our side is read from `src/app/registry.tsx`, `docs/SITE_PARITY.md` and the
feature folders. Where code and doc disagree, the code wins.

## Market at a glance

| Product | Kind | Reach on 2026-10-27 | Last update | Ads / paywall |
|---|---|---|---|---|
| **Apna BEU** — `app.biru.apnabeu` | Android app | 10K+ installs, 4.7/5 (322 reviews) | 2026-10-18 | **Ads**; no paywall |
| **Beu Connect** — `app.biru.beuconnect` | Android app | 1K+ installs, 4.3/5 (21) | 2026-10-23 | none declared |
| **MyBEU** — `com.durganand1.MyBEU` | Android app | 1K+ installs, 4.6/5 (18) | **2025-10-07** | none; ad-free claim |
| **BEU Results** — beubih.vercel.app | web | not public | live | none |
| **BEU Nexus** — beunexus.me | web dashboard | not public | live, "Engine V3.0" | none seen |
| **BEU Bihar** — beubihar.com | web portal | not public | live, © 2026 | sign-in |
| **Apna College Bihar** — apnacollegebihar.online | web funnel | not public | live | **AdSense** + WhatsApp gate |

Two facts frame the rest:

1. **Our name is taken.** "Beu Connect" (`app.biru.beuconnect`, Vikash
   Innovations) predates us; our app is `BEUConnect` (`org.beuconnect.app`). A
   search finds them first. This is a release-owner naming decision, not a
   feature.
2. **No competitor can fetch a BEU result honestly.** BEU's token endpoint
   returns `403 CAPTCHA verification required` (re-run 2026-10-26,
   `docs/SITE_PARITY.md` §1). Every "instant result" opens the BEU site or
   breaks; only our portal yields a native result.

---

## Products

### 1. Apna BEU

**Store** https://play.google.com/store/apps/details?id=app.biru.apnabeu ·
**Run by** Mindsnapps (Sandeep Kumar, Sasaram, Bihar; `mindsnapps@gmail.com`;
same account ships *Apna GATE: Practice & Analysis*) · **Web**
https://mindsnapps.web.app/ — a placeholder, "currently being built" (seen), so
distribution is Play only · **Price** free, **contains ads**, no paywall ·
10K+ installs, 4.7/5, 322 reviews (309 in the ratings block), updated
2026-10-18.

The market leader by installs. A tile-grid app that wraps the official BEU
result page and adds syllabus, PYQ, notices and a calculator.

| Category | What is there | Evidence |
|---|---|---|
| Results — fetch | Four session rows (`2021-25` → `2024-28`), semester chips per session, then *Check Your Result* (reg number + eight large semester buttons). | seen `apnabeu-results.png`, `apnabeu-results-entry.png` |
| Results — marks/CGPA | One semester at a time; no eight-semester history. | seen |
| Results — rank/merit | None. | — |
| Results — bulk | *Bulk Results*: start number, end number, semester. | seen `apnabeu-results-entry.png` |
| Results — battle | *Battle 1v1* tile; no comparison screen in any shot. | seen (tile only) |
| Results — alerts | "Latest Result Notifications" bell above the session list. | seen `apnabeu-results.png` |
| PYQ/papers | Papers rendered **as text**: header, `Code`, `Full Marks`, instruction block, every question and sub-part, `Ask AI` under each. "Offline PYQs · Last 5 years". | seen `apnabeu-pyq.png`, `apnabeu-pyq-chemistry.png` |
| Notes/syllabus | Unit → topic, each topic with `Ask AI` · `YouTube` · `Mark as Done`; chips *Ask AI*, *YouTube*, *Syllabus Tracker*. A *Notes* tile existed in the older home shot, gone in the newer one. | seen `apnabeu-syllabus.png`, `apnabeu-syllabus-chemistry.png`, `apnabeu-home-older.png` |
| Calculators | SGPA calculator and predictor: Subject/Credits/Internal/External/Total, `+ Add Subject`, `− Delete Subject`, practical grades. No CGPA, no percentage, no target. | seen `apnabeu-sgpa-calculator.png`, `apnabeu-sgpa-predictor.png` |
| Notices | Reverse-chronological cards with date chip, red `NEW` pill on the newest, PDF button, refresh icon. | seen `apnabeu-notices.png` |
| Attendance/routine | Full-width *Class Time Table* button; a *Biometric* tile whose behaviour is not shown. Listing claims an attendance tracker. | seen + listing |
| Community/chat | **Telegram Group** and **WhatsApp Channel** buttons on Home. | seen `apnabeu-home.png` |
| Jobs/internships | None. | — |
| Downloads/NDL | None. *Colleges* and *Campus Kit* tiles, contents unknown. | seen |
| Exams | GATE section (About, Syllabus, PYQs) plus a hub: UPSC, BPSC, UPPSC, UPSC ESE, CAPF, CDS. GATE PYQs "2007 to 2026". | seen `apnabeu-exams-hub.png`, `apnabeu-exams-hub-alt.png` |
| Profile/onboarding | None; no sign-in. | seen |
| Offline | Claimed only ("Offline BEU PYQs"); no offline indicator in a shot. | listing |
| Design/UX | Navy panels, chrome-blue gradient headers, thick icon tiles, 3-across, emoji in nav, script + stencil display faces. Legible at 360 dp, dense. | seen |

**Signals.** A review reports topic progress resetting between launches
(2026-05-05); the developer replied that they "couldn't find a single device"
and suggested the student's phone was at fault. Two reviews ask for the
ECE (ACT) branch that the app lacks (2026-08-06, 2026-08-24). Positive reviews
are generic.

### 2. Beu Connect

**Store** https://play.google.com/store/apps/details?id=app.biru.beuconnect ·
**Run by** Vikash Innovations · **Price** free, no ads declared ·
1K+ installs, 4.3/5, 21 reviews, updated **2026-10-23** (the most recently
maintained app here) · no website linked from the listing.

The closest thing to a direct rival, including in name. Sells itself as an
"academic toolkit" with AI and a GATE test engine.

| Category | What is there | Evidence |
|---|---|---|
| Results — fetch | `BEU Results` tile, "Official Server Synchronization". No result flow shown in any screenshot. | listing (tile seen `beuconnect-home.png`) |
| Results — marks/CGPA/rank/merit | None shown. | — |
| PYQ/papers | Branch- and semester-wise PYQs, "Fast PDF viewing", "Quick download support"; a separate `GATE PYQs` tile. | listing |
| Notes/syllabus | Unit → topic with a per-topic `Ask AI` · `YouTube` · `Mark Done` and a **progress counter** ("0 / 6 topics completed"), or `Ask AI` pinned at the unit foot — two layouts in their own shots. **VVI Topics** is a first-class home tile. | seen `beuconnect-syllabus.png`, `beuconnect-ask-doubt.png`, `beuconnect-home.png` |
| Calculators | `GPA Calculator` tile; listing names SGPA and CGPA calculators. | seen + listing |
| Notices | `BEU Notices` tile, "Academic Updates". | seen + listing |
| Attendance/routine | 75 % ring ("Biometric Attendance"), subject chips with per-subject percentages, `Present / Absent / Holiday / Required / Bunk` counters, **month calendar** coloured present/absent/holiday, `+ Add`. | seen `beuconnect-attendance.png` |
| Community/chat | `Ask Doubt` in the tab bar; no chat or channel. | seen |
| Jobs/internships | "Internship & Career Resources" inside the links hub; no feed. | listing |
| Downloads/NDL | No NDL. A real **links hub**: NSP, NPTEL, SWAYAM, AICTE, Bihar Student Credit Card, PMS, DigiLocker, ABC ID. | listing |
| Exams | GATE syllabus + PYQs, and a **mock engine**: attempts and analytics, `All Years / GATE 2026 / 2025 / 2024`, `Full Mocks (180m) / Subject Tests (45m)`, subject filter with count, paper cards at **65 Qs / 100 M / 180 m**, last score, `RE-ATTEMPT MOCK`, virtual GATE calculator, "AI Solutions on Demand". | seen `beuconnect-gate-mock.png` |
| AI | In-app `Ask Doubt` returns a numbered, exam-shaped answer **with a labelled SVG diagram** (manometer, `P = ρgh`). | seen `beuconnect-ask-doubt.png` |
| Profile/onboarding | `Profile` tab. | seen `beuconnect-attendance.png` |
| Offline | "100% OFFLINE" badge. | listing |
| Design/UX | Neon blue/purple gradients, glowing borders, small tiles and ~9 pt captions in app; marketing hero art in store shots. | seen |

### 3. MyBEU

**Store** https://play.google.com/store/apps/details?id=com.durganand1.MyBEU ·
**Run by** DTechy · **Price** free, "One-stop Ad-free app" (listing) ·
1K+ installs, 4.6/5, 18 reviews, updated **2025-10-07** — a year stale in a year
BEU changed the syllabus.

| Category | What is there | Evidence |
|---|---|---|
| Results — fetch | Registration number, **batch**, **semester**, `Fetch Result`. Listing adds "export as PDF" and "save for later". | seen `mybeu-result-form.png` |
| Results — marks/CGPA/rank | Claimed export; no rank, no merit. | listing |
| PYQ/papers | Branch + semester selects, `Search`, and an honest empty state: "No PDFs found. Try selecting a different branch/semester. More PYQs coming soon." | seen `mybeu-pyq.png` |
| Notes/syllabus | **15-branch grid** — CSE, CSE (AI), Civil, ECE, EEE, Electrical, Mechanical/Mechatronics, IT, Leather Technology, Instrumentation, Chemical, 3D Animation, Food Processing, Aeronautical/Mining, Biomedical. Widest in the market. | seen `mybeu-syllabus-branches.png` |
| Calculators | None. | seen |
| Notices | Implied only; no notice screen shown. | — |
| Attendance/routine | None. | — |
| Community/chat | `Provide Feedback` row; no channel. | seen `mybeu-home.png` |
| Jobs/internships | None. | — |
| Downloads/NDL | None. | — |
| Exams | None. | — |
| Profile/onboarding | `Personal Dashboard` (flagged `NEW`) on Home. | seen `mybeu-home.png` |
| Offline | None claimed. | — |
| Design/UX | Red/white Material template; greeting by time of day ("Good Night! Future Innovator"); tabs `HOME / Gaming Zone / AllApps / Admin Board`. | seen `mybeu-home.png` |

**Signals.** A July 2026 review: "cse syllabus given is wrong, update it bro. and
many features are not working properly." No build since 2025-10-07.

### 4. BEU Results — beubih.vercel.app

**URL** https://beubih.vercel.app/ · **Run by** Pushkar Kumar Vats
(IIT Kharagpur — footer credit), open source as
`github.com/pushkarkumarvats/BEU-SENA`, contact `beubihar@gmail.com` ·
**Price** free, no ads, no login.

A single-purpose result portal with the best data surface in the market.

| Category | What is there | Evidence |
|---|---|---|
| Results — fetch | One field, "Enter 10–15 digit reg number", `View Result`, "Auto-Detection Enabled: Your semester & Year will be automatically detected". | seen `beubih-home.png` |
| Results — reliability | Submitting `21101157017` on 2026-10-27 left the tab on Chrome's "This page couldn't load" screen. One attempt, one network; recorded as observed, not a verdict. | seen `beubih-result-attempt.png` |
| Results — marks/CGPA | "Automatic CGPA/SGPA calculation" (listing). | listing |
| Results — rank/merit | `/merit-list`: programme tabs, batch selector, **stat cards** (`60` toppers, `9.38` top CGPA, `6` branches), then per-branch tables `Rank · Name · CGPA · SGPA · College` with a gold/silver/bronze top three. | seen `beubih-merit-list.png` |
| Results — archive | `/results-table`: every exam as `EXAM NAME · BATCH/SESSION · EXAM HELD · PUBLISHED DATE`, grouped by M.Tech / MBA / B.Arch / B.Tech, with held and published pills. | seen `beubih-results-table.png` |
| Results — export | "Download Grade Card / Mark Sheet instantly" (listing). | listing |
| PYQ/papers | None. | — |
| Notes/syllabus | None. | — |
| Calculators | None. | — |
| Notices | `/announcements` in the nav; not opened. | seen (nav) |
| Attendance/routine | None. | — |
| Community/chat | Feedback via Google Form only. | seen (footer) |
| Jobs/internships | None. | — |
| Downloads/NDL | Grade card download only. | listing |
| Exams | None. | — |
| Profile/onboarding | None, by design: "No Student Login Required". | seen |
| Offline | None; it is a web page. | — |
| Design/UX | Dark violet gradient, glass cards, pill nav, large centred display type. Polished, but "100% Secure · Bank-grade encryption" and "Results in < 2 seconds" sit directly above the form that failed. | seen |

### 5. BEU Nexus

**URL** https://www.beunexus.me/index.html · **Run by** nobody named; an admin
login, a WhatsApp channel link, "ENGINE V3.0", a `Guest Mode` badge ·
**Price** free, no ads seen.

A dashboard of 24 module tiles. The widest claim list in the market and the
thinnest verification.

| Category | What is there | Evidence |
|---|---|---|
| Results | "Results (Compilation)", "BEU Exam Intel / Nexus Bot". | seen (tiles) |
| PYQ/papers | PYQ Vault: branch (10 options incl. CSE AI & ML, Data Science, Cyber Security, IoT) × semester, `⚡ Reveal Papers`, plus "Open Archive Index". Selects start empty; pressing the button with nothing chosen gives **no feedback at all**. | seen `beunexus-pyq-empty.png` |
| Notes/syllabus | "Nexus Notes — Handwritten Notes" tile. | seen |
| Calculators | "Grade Calc — SGPA/CGPA". | seen |
| Notices | "Beu Notice — Broadcast", "Beu News — Latest Update". | seen |
| Attendance/routine | "Attendance — Tracker", "Holidays — Downtime". | seen |
| Community/chat | Left rail: Community, Mentorship, WhatsApp. | seen |
| Jobs/internships | "Placement — Career Cell", "Internship — AICTE Hub". | seen |
| Downloads/NDL | No NDL. | — |
| Exams | "GATE — Neural Prep", "Nexus Test Series — India's Smartest Mock Engine", "IES/ESE — Admin Exams". | seen |
| College choice | "Nexus College Predictor — Analyze Your Rank, Discover Your Future College". | seen |
| Profile/onboarding | `Guest Mode` badge; no account flow shown. | seen |
| Offline | None claimed. | — |
| Design/UX | Admin console: dark six-across icon tiles, live clock, search box, labels that explain nothing ("Core Logic", "Neural Prep", "Elite Hub", "JUGAAD OS"). | seen `beunexus-home.png` |

**Only the PYQ Vault was exercised.** Treat the other 23 tiles as a roadmap, not
a product.

### 6. BEU Bihar

**URL** https://www.beubihar.com/ · **Run by** not named; Patna,
`contact@beubihar.com`, "© 2026 BEU Bihar" · **Price** free, no ads seen,
**Sign In** offered.

| Category | What is there | Evidence |
|---|---|---|
| Results | `BEU Result` nav item, results card on Home. | seen |
| PYQ/papers | `PYQs` nav + "Download PYQs" block. | seen |
| Notes/syllabus | `Notes` and `Syllabus` nav; syllabus is a course dropdown (B.Tech, B.Pharma, BBA, BCA, Diploma, M.Tech, MBA, MCA). | seen |
| Calculators | None. | — |
| Notices | `Notice` nav + "Check Notices" block. | seen |
| Attendance/routine | None. | — |
| Community/chat | None. | — |
| Jobs/internships | None. | — |
| Downloads/NDL | None. | — |
| Exams | None. | — |
| Profile/onboarding | Sign In only. | seen |
| Offline | None. | — |
| Design/UX | Violet-on-navy template, four quick-access cards, washed-out hero. | seen `beubihar-home.png` |

**Course breadth is its only win**: B.Pharma, BBA, BCA, Diploma, MBA and MCA,
where we are B.Tech only.

### 7. Apna College Bihar

**URL** https://www.apnacollegebihar.online/ · **Run by** not named; Patna-based,
claims a WhatsApp channel of BEU students · **Price** free, **AdSense** funded.

| Category | What is there | Evidence |
|---|---|---|
| Results | Not in the nav. Exam notifications and results are claimed in the modal. | listing |
| PYQ/papers | `PYQ` nav, "PYQ with solutions", "1-Click Offline PDF". | seen + listing |
| Notes/syllabus | "Unit 1 to 5 Hand-Written Notes • BEU Updated", `Notes` nav. | seen |
| Calculators | "BEU SGPA Engine" on a 10-point credit scale. | seen |
| Notices | "BEU 2026 Exam Notifications — Form Fillup, Results & College Routine". | listing |
| Attendance/routine | None. | — |
| Community/chat | Full-screen WhatsApp channel modal on first paint. | seen `apnacollegebihar-home.png` |
| Jobs/internships | "Career & Internships — Govt Scholarships & Placement Drives". | listing |
| Downloads/NDL | "1-Click Offline PDF"; no NDL. | seen |
| Exams | "UGEAC 2026 Predictor", `Compare Colleges`, `Mentorship`. | seen (nav) |
| Profile/onboarding | `Login` / `Sign Up`. | seen |
| Offline | "1-Click Offline PDF" (claimed). | seen |
| Design/UX | Loud: Hindi + English headlines, badge pills, a green WhatsApp sheet over a dimmed page before any content, AdSense DART cookie banner. | seen |

---

## Capability matrix

Ours is `done`, `partial` or `missing`. Competitors are `yes` (seen or listing),
`part` (narrow, claimed only, or a tile) or `—` (absent or unverified).

| Capability | Ours | Apna BEU | Beu Connect | MyBEU | Web |
|---|---|---|---|---|---|
| Individual result lookup | done | yes | yes | yes | beubih |
| Captcha-tolerant native result | done | part (WebView, inferred) | — | — | beubih fails |
| Reg number → name, branch, college | done | — | — | — | beubih: semester only |
| Paper marks, SGPA, CGPA | done | yes | yes | yes | beubih |
| Eight-semester history and trend | done | — | — | part (claimed) | — |
| Branch and college rank | done | — | — | — | beubih (toppers) |
| Merit list with batch filter | partial | — | — | part (claimed) | beubih |
| Exam archive with held + published | missing | — | — | — | beubih |
| Bulk result range | missing | yes | — | — | — |
| Grade-card export or share | missing | — | — | part (claimed) | beubih (claimed) |
| Result-published alert | partial | yes | — | — | — |
| PYQ PDFs by branch and semester | done | yes | yes | part | beubihar |
| PYQ as text, per question | missing | yes | — | — | — |
| Save a paper for offline | partial | part (claimed) | part (claimed) | — | — |
| GATE syllabus and papers | done | yes | yes | — | — |
| GATE mock engine with scoring | missing | — | yes | — | Nexus (claimed) |
| Syllabus unit and topic progress | done | yes (broken) | yes | — | — |
| VVI / important topics | done | part | yes | — | ACB (claimed) |
| Handwritten notes | done | yes | part | part | beubihar |
| Branch and course breadth | partial (7 codes, 2 are EEE) | part | part | yes (15) | beubihar programmes |
| SGPA / CGPA calculator, percentage conversion | done | yes | yes | — | Nexus, ACB (claimed) |
| Attendance tracker | partial | part (claimed) | yes | — | Nexus (claimed) |
| Timetable and holiday calendar | done | yes | — | — | — |
| Notices with PDF viewer | done | yes | yes | part | beubihar |
| Notice recency and unread | partial | yes | — | — | — |
| Cross-content search | done | — | — | — | Nexus names only |
| Study planner | done | — | — | — | — |
| 1v1 result battle | done | tile only | — | — | — |
| Profile and onboarding | done | — | yes | — | — |
| Offline last-good data | done | part (claimed) | part (claimed) | — | — |
| Links hub (NSP to ABC ID) | missing | — | yes | — | — |
| Competitive-exam hub | missing | yes | — | — | Nexus (claimed) |
| Scholarships, internships, placement | missing | — | part | — | Nexus, ACB (claimed) |
| College predictor or compare | missing | — | — | — | Nexus, ACB (claimed) |
| Community channel | missing | yes | — | — | Nexus, ACB |
| Brain games / extras | not planned | — | yes | yes | Nexus ("JUGAAD OS") |
| Ads, login wall or first-paint modal | **none** | ads | — | — | all three sites |

---

## Gap table

Only what is missing or partial. `Impact` = how many students hit it and how
badly (H/M/L). `Effort` = S (one screen, no new data), M (a screen plus data or
a new fetch), L (a new engine or pipeline).

| Feature | Competitors that have it | Our status | Impact | Effort |
|---|---|---|---|---|
| Exam archive with held + published dates | beubih (`/results-table`) | missing | **H** | **S** |
| Bulk result range → table | Apna BEU | missing | **H** | M |
| Grade card / result share (PNG or PDF) | beubih, MyBEU (both claimed) | missing | **H** | M |
| Links hub (NSP, NPTEL, SWAYAM, AICTE, BSCC, PMS, DigiLocker, ABC) | Beu Connect | missing | **H** | **S** |
| Students directory reachable from the UI | — (nobody has it) | **registered but unreachable** — `studentsRoutes` is spread in `registry.tsx`, no screen links to `students` | **H** | **S** |
| Merit list with batch switch and summary stats | beubih, MyBEU (claimed) | partial | H | S |
| Branch breadth beyond 6 codes | MyBEU (15), Nexus (10), Apna BEU (asked for ECE ACT) | partial | **H** | L |
| Save a PYQ for offline | Apna BEU, Beu Connect (claimed) | partial | M | S |
| Attendance as a month with % ring | Beu Connect | partial | M | S |
| Notice recency, `NEW`, unread count | Apna BEU | partial | M | S |
| Result-published alert per exam | Apna BEU | partial | M | M |
| Community channel / invite loop | Apna BEU, Nexus, ACB | missing | M | S |
| Competitive-exam hub (UPSC, BPSC, ESE, CAPF, CDS) | Apna BEU, Nexus (claimed) | missing | M | M |
| GATE mock engine with scoring | Beu Connect, Nexus (claimed) | missing | M | L |
| PYQ as text, per question | Apna BEU | missing | M | L |
| Scholarships / internships / placement feed | Beu Connect, Nexus, ACB | missing | M | M |
| UGEAC predictor / compare colleges | Nexus, ACB (claimed) | missing | M | L |
| Non-B.Tech programmes | beubihar | missing | L | L |
| Brain games / extras | Beu Connect, MyBEU, Nexus | not planned | L | M |

---

## What they do better

Ordered by what it costs us. Each names the exact screen and interaction.

1. **Exam archive with publish dates.** beubih's `/results-table` answers "has my
   result come out yet" as `name · batch · held · published`, grouped by
   programme (`beubih-results-table.png`). Our notices have no exam grouping.
2. **Bulk results.** Apna BEU takes a start number, an end number and a semester
   and returns the range (`apnabeu-results-entry.png`). Class representatives use it;
   nothing of ours does.
3. **Question-level PYQs.** Apna BEU renders instructions, marks and every
   sub-part as selectable text with `Ask AI` per question
   (`apnabeu-pyq.png`). Our PDFs cannot be copied, searched or asked about.
4. **Mock tests with scoring.** Beu Connect's GATE engine has attempts,
   analytics, year and subject filters, timed papers and re-attempt
   (`beuconnect-gate-mock.png`). We ship GATE papers and no way to sit one.
5. **Merit with a summary and a batch switch.** beubih leads with three numbers
   and lets the batch change the table (`beubih-merit-list.png`). Our merit and
   `students.leads` split that job across two screens.
6. **Attendance as a calendar.** Beu Connect colours each day
   present/absent/holiday, keeps subject percentages and puts counters under a
   75 per cent ring (`beuconnect-attendance.png`). Our log is a list and a target.
7. **Hubs for the official web.** Beu Connect names the eight links a student
   needs each semester; Apna BEU puts UPSC, BPSC, ESE, CAPF and CDS beside GATE
   (`apnabeu-exams-hub.png`). We surface neither.
8. **Branch and course breadth.** MyBEU lists 15 branches, including Leather
   Technology and Biomedical (`mybeu-syllabus-branches.png`); beubihar serves B.Pharma,
   BBA, BCA, MBA and MCA. Our `BRANCHES` is six codes plus a duplicate EEE.
9. **A result a student can send.** beubih and MyBEU claim a downloadable grade
   card (listings). We can copy a battle summary, not hand over a document.
10. **Notice recency and distribution.** Apna BEU dates every card, marks the
    newest with `NEW` (`apnabeu-notices.png`) and puts Telegram and WhatsApp
    on Home; Apna College Bihar opens with a WhatsApp gate. We have neither.
11. **In-app AI answers.** Beu Connect returns a finished answer with a diagram
    (`beuconnect-ask-doubt.png`). Our `Ask AI` hands a crafted prompt to the
    installed assistant: cheaper and more private, but one tap further away.
12. **A visible syllabus counter.** Beu Connect prints `0 / 6 topics completed`
    under each unit (`beuconnect-syllabus.png`). Our topic progress exists but the
    unit header does not total it.

## What we already beat

1. **The result path survives the captcha.** `results.portal` loads the official
   page, captures the payload the student already earned and normalises it
   through `fromPayload()`, so rank, battle and merit treat it as ordinary
   (`docs/SITE_PARITY.md` §1). beubih's form failed to a browser error page.
2. **A registration number becomes a person before any request.** `parseReg` →
   identity cache → saved result → roster yields name, branch and college on
   Home, in onboarding and in Results. beubih stops at semester.
3. **Eight-semester SGPA/CGPA history with a trend.** Apna BEU shows one
   semester; beubih shows a table row.
4. **Rank and merit from real rosters.** `results.rank` gives branch and college
   standing from published CSVs. Apna BEU has none; beubih has toppers but no
   per-student college position.
5. **Honest states instead of dead ends.** Every screen says whether it used
   live data, a saved copy, a published row or offline data. beubih fails to a
   browser page; BEU Nexus gives no feedback at all.
6. **Two-way result comparison.** `results.battle` compares paper by paper,
   declares a verdict only on shared totals and copies a summary. Apna BEU's
   `Battle 1v1` is a tile with no comparison shown.
7. **A study planner.** `planner` builds a plan from the syllabus. No competitor
   has one.
8. **Per-topic actions that do not lie.** `syllabus` shows *Short note* only
   when the VVI manifest has the code, *YouTube* with a copy fallback, and
   *Ask AI* through `src/lib/ask-ai.ts`. Apna BEU loses done marks instead.
9. **AI without a server bill or a data trail.** We never host a model or store
   an answer; the prompt names the course, paper and question and asks for
   definition, points, a diagram, a worked example and a five-minute version.
10. **No ads, login or modal, and search across everything.** Apna BEU carries
    ads, Apna College Bihar opens a WhatsApp sheet over an AdSense banner,
    beubihar wants a sign-in. `search`, `syllabus.search`, `notices.search` and
    the `data` browser reach content rivals only reach tile by tile.

---

## Top 10 recommendations

Ordered by impact ÷ effort. Each names the screen, the route and what "done"
means. Routes exist unless the row says new; a new route also needs a row in
`docs/ARCHITECTURE.md` §4 and `docs/SITE_PARITY.md`.

### 1. Exam archive — "has my result come out?"

**Route** `results.archive` (new), linked under the lookup form on `results` and
from the Home notice ticker. **Effort S · Impact H.**

Data: `native/assets/data/exams.json`, generated from the notice feed plus the
published roster filenames — `programme, name, batch, semester, heldOn,
publishedOn, resultUrl?`. No hand-typed dates; regenerate with the data scripts
(`beu-data` skill).

Done when:
- `results.archive` lists every exam newest-first with `name`, `batch`,
  `held <Mon YYYY>` and `published <dd Mmm YYYY>` as separate columns that keep
  the exam name readable at 320 pt.
- Programme (B.Tech default, M.Tech, MBA, B.Arch) and semester filters live in
  the route params, so a filtered view can be pushed and survives a restart.
- The newest exam carries `NEW` for 14 days after `publishedOn`.
- A row with `resultUrl` opens `results` pre-filled with that semester; a row
  without one is not tappable.
- Empty state: "No exams published yet." plus the last four known exams.
- QA: screen test over three fixtures (new, old, missing date); unit test that a
  row without `publishedOn` sorts last.

### 2. Give the students directory an entrance

**Route** `students`, `.college`, `.branch`, `.student`, `.leads` — registered in
`src/app/registry.tsx`, but **no screen links to it**. Add one entry to
`src/app/more.tsx` under "Results & records" and one row on `home`.
**Effort S · Impact H.**

Done when:
- `more` carries `Students` ("Every BEU student, by college") and a tap lands on
  `students` in one push; the Home row is two taps from the greeting.
- `students` lists batches, `students.college` lists branches with counts,
  `students.branch` lists newest batch first, `students.student` hands off to
  `results` and `results.rank`, `students.leads` shows top CGPA.
- Each route title names the college, branch or student — never "Students".
- Every screen works with the network off (the register ships in
  `assets/data`).
- `bun qa/scan-push-targets.mjs` is clean, and a back tap from `students.student`
  returns to the branch, not the tab root.
- QA: one screen test per route, and a test that a reg number absent from the
  register shows an empty state, not a blank screen.

### 3. Links hub — the eight URLs a BEU student needs

**Route** `tools.links` (new), a row on `tools` and `more`. **Effort S · Impact H.**

NSP, NPTEL, SWAYAM, AICTE, Bihar Student Credit Card, PMS, DigiLocker, ABC ID.
Each row: name, one-line purpose, host, external-link chevron.

Done when:
- Every row opens the **system browser** via `openExternal`; a failure copies the
  URL and says "Link copied".
- The list is static data and works offline; every row is ≥44 pt.
- A per-row `Copy` and one `Copy all` in the header (for a class group).
- The eight URLs live in one file, each checked against the official host before
  merge.
- QA: screen test asserts eight rows and that a tap calls `openExternal` once.

### 4. Grade card a student can send

**Route** `results` — a `Share` action on the result view. **Effort M · Impact H.**

Done when:
- `Share` renders a one-page card (name, reg no, branch, college, semester,
  SGPA, CGPA, paper table) to a PNG ≥1080 px wide and opens the share sheet.
- The footer says `Unofficial copy`; no BEU crest is used.
- The action is disabled with an explanation when the result is a saved copy
  older than the current semester.
- Works offline for a saved result; the image is generated on device.
- QA: unit test on the renderer (dimensions, every field, long-name truncation);
  screen test that the button is absent while loading.

### 5. Bulk results for a class

**Route** `results.bulk` (new), a row under the lookup form. **Effort M · Impact H.**

Start reg, end reg, semester (defaults to the student's own). Cap the range at
120 and say so before starting; land on `results.table` sorted by CGPA.

Done when:
- Each row reports `live`, `saved copy`, `published row` or `missing`; the header
  shows `42 of 60` with a per-state count.
- One failure never aborts the run; the summary reports at the end.
- A range wider than 120 says "That is 214 numbers. Narrow the range to 120."
  and does not start.
- The finished table exports to CSV through the share sheet.
- QA: unit tests for range parsing (reversed, junk, >120); screen test that a
  mid-range failure still renders the successes.

### 6. Merit that switches batch and leads with numbers

**Route** `results.merit`. **Effort S · Impact H.**

Done when:
- A batch selector sits above the table and changing it re-ranks without leaving
  the screen; the batch is a route param.
- Three stat cards precede the list: toppers shown, highest CGPA, branches
  covered — computed, never hard-coded.
- The top three rows carry a distinct rank treatment; ranks 4+ are plain.
- A batch with no published table shows "No table published for this batch yet."
  and the batches that do exist.
- QA: unit test for the stats over an empty roster (renders `—`, never `0`).

### 7. Notices that look new

**Route** `notices` (+ the Home ticker). **Effort S · Impact M.**

Done when:
- Every card shows a date chip (`12 Jan 2026`); the newest two carry `NEW` until
  opened, tracked per notice in Storage.
- The `notices` header and the Home tile show an unread count above zero.
- A `Results` chip filters to result notices and links into `results.archive`.
- Opening a PDF marks the notice read **before** the viewer mounts.
- QA: screen test with three notices (two unread); storage test that the marks
  survive a remount.

### 8. Save a paper for offline

**Route** `pyqs.paper`, `pyqs.pdf`, `settings.storage`. **Effort S · Impact M.**

Done when:
- Every paper row has `Save` / `Saved` with its size (`1.2 MB`); a saved paper
  opens with the network off.
- `settings.storage` totals saved-paper bytes and offers `Clear saved papers`
  with one confirmation.
- A corrupt saved file says "The saved copy is incomplete. Open online." and
  offers retry.
- Saving never blocks the list; the row shows progress and can be cancelled.
- QA: the offline harness opens a saved paper with the network off and asserts
  the viewer renders.

### 9. Attendance as a month, not a list

**Route** `tools.attendance`. **Effort S · Impact M.**

Done when:
- A month grid above the log colours each day present / absent / holiday, rings
  today, and a tap opens that day's entries.
- The header carries a percentage ring and `Present / Absent / Holiday`
  counters, computed from the same log the list writes.
- The 75 % target line and the safe-bunk number are readable without scrolling
  at 320 pt.
- Month navigation keeps the selected subject filter.
- QA: unit tests for the percentage across a month boundary and for a subject
  with zero classes (renders `—`, never `0 %` or NaN).

### 10. One row that brings a classmate

**Route** `more` (footer) and one row on `home`, below the fold. **Effort S ·
Impact M.**

Done when:
- `Share BEUConnect` opens the system share sheet with a short message and the
  install link; no tracking parameters.
- Telegram and WhatsApp open the channel/group externally and copy the link when
  no app handles it.
- The row never appears in `onboarding` or on a result screen.
- QA: screen test that the row renders once on `more` and that a failed open
  produces the copy fallback.

### Bigger bets, not in the top 10

| Bet | Why not now | Trigger to start |
|---|---|---|
| GATE mock engine (one paper, ten sourced questions, score + review) | Needs sourced questions and marking rules; Beu Connect already owns it | When `exams` ships and one paper's questions are parsed |
| PYQ as text, per question | Needs a parsing pipeline over official papers | When the parser clears one subject with no loss |
| Branch coverage beyond 6 codes | Needs new syllabus and roster extraction | When a batch's tables exist for the new branch |
| UGEAC predictor / compare colleges | Needs published cutoffs; neither rival publishes a source | When a verified cutoff file exists |

**Not recommended:** brain games, a WhatsApp gate, a login wall, an in-app model
we would have to host, and a predictor built on guessed cutoffs. Non-B.Tech
programmes stay out of scope unless the mission changes.

---

## Screenshot index (`native/docs/competitor-shots/`)

| File | What it shows |
|---|---|
| `apnabeu-play-listing.png` | Apna BEU store page: 10K+, 4.7/5, ads, screenshot carousel |
| `apnabeu-home.png` | Home tiles: PYQs, Syllabus, Results, Notice, Biometric, SGPA, Colleges, Campus Kit, Calendar, Timetable, Telegram, WhatsApp |
| `apnabeu-syllabus.png` | Unit → topic list with `Ask AI` / `YouTube` / `Mark as Done` |
| `apnabeu-pyq.png` | PYQ as text: header, code, marks, instructions, Q1 sub-parts, `Ask AI` |
| `apnabeu-sgpa-calculator.png` | SGPA calculator: credits, internal, external, total, add/delete, practical grades |
| `apnabeu-notices.png` | Notice cards with date chips, `NEW` pills, PDF buttons |
| `apnabeu-results.png` | Results: session rows, semester chips, Check / Bulk / Battle 1v1, NEW vs OLD site |
| `apnabeu-exams-hub.png` | GATE tiles plus Civil Services (UPSC, BPSC, UPPSC) and government exams |
| `apnabeu-holidays-jan.png` | Holiday calendar, Jan–Feb, dots and a holiday line |
| `apnabeu-home-older.png` | Older home: BEU Site, Predict SGPA, College Site, Notes, Holidays |
| `apnabeu-syllabus-chemistry.png` | Syllabus topics with `Ask AI` / `YouTube` for Chemistry |
| `apnabeu-pyq-chemistry.png` | Chemistry PYQ 2024 as text |
| `apnabeu-sgpa-predictor.png` | SGPA predictor variant of the calculator |
| `apnabeu-results-entry.png` | Result entry: reg number, eight semester buttons, Bulk Result overlay |
| `apnabeu-holidays-oct.png` | Holiday calendar, Sep–Oct, current day ringed |
| `apnabeu-exams-hub-alt.png` | GATE and exam hub, second angle |
| `apnabeu-mindsnapps-site.png` | Developer site: "currently being built" |
| `beuconnect-play-listing.png` | Beu Connect store page with all five screenshots |
| `beuconnect-home.png` | Home tile grid and "YOUR EXAM. YOUR EDGE." |
| `beuconnect-ask-doubt.png` | Ask Doubt answer with an SVG manometer diagram |
| `beuconnect-gate-mock.png` | GATE mock engine: filters, 65 Q / 100 M / 180 m, re-attempt |
| `beuconnect-attendance.png` | Attendance: 75 per cent ring, subject chips, counters, month calendar |
| `beuconnect-syllabus.png` | Syllabus with per-topic `Ask AI` / `YouTube` / `Mark Done` and `0 / 6 topics completed` |
| `mybeu-play-listing.png` | MyBEU store page |
| `mybeu-splash.png` | Splash: "One App. All your BEU Needs." |
| `mybeu-home.png` | Home: greeting, Syllabus/Result tiles, Result/Holiday/PYQs, Personal Dashboard, feedback, tabs incl. Gaming Zone |
| `mybeu-syllabus-branches.png` | Fifteen-branch syllabus grid |
| `mybeu-result-form.png` | Result form: reg number, batch, semester, Fetch Result |
| `mybeu-pyq.png` | PYQ search with an honest empty state |
| `beubih-home.png` | Landing: reg field, auto-detection, programme cards, footer |
| `beubih-merit-list.png` | Batch toppers: stat cards, branch sections, ranked tables |
| `beubih-results-table.png` | Exam archive with batch, held and published dates |
| `beubih-result-attempt.png` | Result submit failing to a Chrome error page |
| `beunexus-home.png` | Dashboard: 24 module tiles, clock, search, Guest Mode |
| `beunexus-pyq.png` | PYQ Vault initial state |
| `beunexus-pyq-empty.png` | `Reveal Papers` with nothing selected, no feedback |
| `beubihar-home.png` | Violet content portal with four quick-access cards |
| `apnacollegebihar-home.png` | WhatsApp channel modal over an AdSense consent banner |

## Legal and ethics

- Screenshots are public store listings and public pages, captured for internal
  comparison; no competitor asset, logo or copy is reused in our product.
- Claims are labelled `seen`, `listing` or `inferred`; nothing is attributed from
  marketing copy alone. A feature only advertised is `part` in the matrix.
- We do not copy competitor text, diagrams, question banks, notes or PDFs. Names
  and marks belong to their owners; the "Beu Connect" collision is a naming
  decision, not permission to use their mark.
- No captcha is bypassed: `results.portal` loads the official page and captures
  only the payload the student earned by solving it themselves. No solver, token
  replay or headless farm. No pirated material either: PYQs are official papers,
  notes come from `notes-src/`, and hub rows point at official hosts.
- One live result attempt on beubih failed at the network layer; no result
  payload was retained. Installs and ratings are Google's buckets read on
  2026-10-27; re-check before public use.

## Method and limits

- Chrome through `agent-browser`, one named session, 2026-10-26 to 2026-10-27.
  Store pages at `hl=en_IN&gl=IN`; site shots are 1440 × 1000, app shots the
  developers' own 900 px uploads.
- Nothing was installed; Android claims come from listings and developer
  screenshots, so `seen` means seen in a store screenshot. BEU Nexus is the
  weakest evidence: one of 24 modules was exercised.
- Apna BEU shows 322 reviews in one block and 309 in another; Google renders
  both, so both are recorded.
- Not surveyed: YouTube and Telegram groups with no site (attention rivals with
  nothing to inspect) and the official `beu-bih.ac.in` portal, a data source
  rather than a rival.
- Re-run the store sections first: counts move weekly, and Beu Connect shipped on
  2026-10-23, four days before this survey.

STATUS: complete
