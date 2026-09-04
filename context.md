# Flow (FlowState-Rail) — Project Context & Master Execution Blueprint
> **Smart India Hackathon (SIH) — Problem Statement 26027**  
> *AI-Powered Automatic Block Planning to Maximize Asset Availability for Train Operations on Indian Railways*

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Operational Challenge
In Indian Railways, maintenance across fixed infrastructure departments operates in decentralized silos:
* **TMS (Track Management System):** Engineering / P-Way defect logs (USFD rail fractures, IMR/OBS rail flaws, Track Geometry Index TGI degradation, tamping machine requests).
* **SMMS (Signalling Maintenance & Management System):** S&T assets (point machine stroke latency in ms, track circuit fail-drops, relay interlocking overhauls, signal LED lamp life).
* **TDMS (Traction Distribution Management System):** Electrical TRD assets (25kV AC OHE contact wire wear in mm, cantilever insulator washing, power block isolators).
* **COA (Control Office Application):** Real-time train operations, scheduled passenger timetables, and freight path allocations.
* **BDMS (Block & Disconnection Management System):** Manual corridor block requests submitted independently by P-Way, S&T, and TRD supervisors.

Because departments submit disconnection requests independently without unified cross-department optimization, the current manual process suffers from:
1. **Low Asset Utilization:** Multiple separate traffic blocks are taken on the same corridor on different days, unnecessarily shutting down lines 3 to 4 times more often than required.
2. **Train Punctuality Loss:** Uncoordinated blocks clip scheduled passenger train paths, causing cascading terminal choke-ups and passenger delays.
3. **Suboptimal Maintenance Windows:** Urgent maintenance is often deferred due to lack of sectional line capacity, increasing safety derailment risks.

### 1.2 The "Flow" Solution
**Flow** is an AI-driven, multi-department **Automatic Block Planning & Digital Twin Platform** that:
1. **Ingests Maintenance Feeds:** Harmonizes defect logs from TMS, SMMS, and TDMS into a unified spatial-temporal queue.
2. **Shadow-Block Bundling Optimization:** Employs Google OR-Tools (CP-SAT Constraint Programming) to co-locate and bundle Engineering, S&T, and Electrical works into the exact same physical outage window, reducing line downtime by **50% to 65%**.
3. **COA Timetable Deconfliction:** Analyzes train paths to schedule blocks during natural timetable slack periods, prioritizing high-speed trains (Vande Bharat, Rajdhani, Shatabdi) to ensure **zero passenger train punctuality loss**.
4. **Authentic Electronic Interlocking (EI) VDU Digital Twin:** Delivers a 60 FPS real-time visual display unit matching authentic Indian Railways signaling standards (Medha / Hitachi standard) with zero lag.

---

## 2. Current Architecture & Completed Milestones

### 2.1 Technology Stack
* **Backend:** Python 3.11, FastAPI, Python-SocketIO (WebSocket server), Google OR-Tools (CP-SAT v9.8+), Pandas, NetworkX.
* **Frontend:** React 18, SVG Vector Canvas, `react-zoom-pan-pinch` (GPU-accelerated vector transform engine), JetBrains Mono & Inter typography.
* **Ports & Services:**
  * Backend API & WebSocket: `http://localhost:8002`
  * Frontend Application: `http://localhost:3000`

### 2.2 Completed Milestones
1. **0-Lag Asynchronous Solver Engine (`Backend/main.py` & `Backend/optimizer.py`):**
   * Completely eradicated the 1–5 second Python GIL freeze by offloading OR-Tools CP-SAT solving into a dedicated worker thread via `await asyncio.to_thread(...)`.
   * Imposed an anytime solver cutoff (`solver.parameters.max_time_in_seconds = 0.8`, `num_search_workers = 4`).
   * WebSocket heartbeats and frame ticks remain locked at 60 FPS with zero stutter.
2. **Authentic Indian Railways Electronic Interlocking (EI) VDU Digital Twin (`frontend/src/components/TrackDiagram.js`):**
   * Modeled directly from real station master control panels (reference: Southern Railway Chennai Division / Medha & Hitachi EI standards).
   * **Deep Obsidian Display (`#000000`):** Replaced toy canvas dots with crisp technical track circuit lines (`#94a3b8`).
   * **Authentic Track Circuit Conventions:**
     * Idle / Clear: Crisp technical steel line with labeled circuit ID (`10T`, `11AT`, `L1T`, etc.).
     * Route Set & Locked: Interlocking amber line (`#eab308`).
     * **Train Occupied:** Solid glowing red line (`#ff0033`), matching standard Indian Railways VDU convention.
     * Maintenance Block: Pulsating hazard hatching with `[ 🚧 BDMS BLOCK ]` indicator.
   * **VDU Control Push-Buttons Row:**
     `[ SIGNAL CLEAR (KL) ]`, `[ CANCEL ROUTE (KR) ]`, `[ EMERGENCY ROUTE RELEASE (ERR · 120s) ]`, `[ CALLING ON (CO) ]`, `[ EMERGENCY POINT (EPO) ]`, `[ CRANK HANDLE UNLOCK ]`, `[ AXLE COUNTER RESET ]`, `[ 25kV OHE ENERGIZED ]`.
   * **Trilingual Station Titleplate:**
     `उत्तर रेलवे · पुरानी दिल्ली जंक्शन` / `OLD DELHI JUNCTION (DLI) · 16 PLATFORMS` / `NORTHERN RAILWAY`.
3. **16-Platform Old Delhi Junction Topology & 1:12 Turnout Geometry:**
   * 228 interlocking nodes and 268 track circuits.
   * Authentic 1:12 gentle diverging turnout geometry (~18° slope).
   * **Platforms 1 to 8:** Dedicated UP platform lines (East -> West).
   * **Platforms 9 to 16:** Dedicated DN platform lines (West -> East).
   * **Loco Reversal Run-Around Neck (`LOCO-REV`):** Reversal slips (`SLIP-LOCO-W`, `SLIP-LOCO-E`) allowing light engines to detach, run around the rake, and re-couple.
   * **Safety Sand Humps (`SAND-HUMP-W`, `SAND-HUMP-E`):** Standard Indian Railways overrun sand traps protecting passenger main lines.
4. **Directional Traffic Architecture & Deadlock Elimination (`Backend/simulation.py`):**
   * Enforced strict Direction of Traffic (DOT) rules in BFS route exploration.
   * Eastbound and Westbound trains are segregated onto opposing platform lines — **guaranteeing zero head-on collisions**.
   * Calibrated platform boarding to 12 seconds, after which trains receive starter signals and cleanly exit into block sections.
5. **High-Frequency 120-Train Realistic Timetable:**
   * Realistic roster: Vande Bharat (22436), Dibrugarh Rajdhani (12424), Howrah Rajdhani (12301), Lucknow Shatabdi (12004), Amritsar Shatabdi (12014), Shiv Ganga SF (12560), Prayagraj Express (12418), Suburban EMUs, Light Locos, and Heavy Coal Freight rakes.
   * Instant spawn at t = 0, 1, 2, 3s followed by continuous arrivals every 5 to 7 seconds.
6. **Zero-Warning Production Cleanliness:**
   * `npm run build` compiles cleanly with **0 errors and 0 warnings**.
   * Python backend compiles cleanly with **0 errors and 0 warnings**.

---

## 3. Comprehensive Next Steps & Feature Roadmap

To win the national round of Smart India Hackathon (Top 5 all India), the project is structured into the following prioritized execution phases:

### Phase 1: Multi-Department Defect Feeds & BDMS Shadow Block Optimizer
* **Objective:** Fulfill the core mandate of SIH Problem Statement 26027 by integrating synthetic defect repositories from TMS, SMMS, and TDMS.
* **Tasks:**
  1. Create synthetic realistic defect feeds (`Backend/data/tms_defects.json`, `smms_defects.json`, `tdms_defects.json`) covering:
     * **TMS:** USFD flaw on Track Circuit `L3T` (urgency: Emergency 24h), TGI score < 60 on Line 2 (Tamping required, 3h).
     * **SMMS:** Point machine 102 stroke time 4800ms > 4000ms threshold (requires 45m motor maintenance), Track circuit DC voltage drop on `11AT`.
     * **TDMS:** OHE contact wire thickness 8.2mm < 8.5mm condemning limit on Platform 3 (requires 2h power block + isolator opening).
  2. Implement the **Shadow-Blocking Engine (`Backend/shadow_block_optimizer.py`)**:
     * Co-locates P-Way tamping, S&T point testing, and TRD contact wire replacement into the **same spatial track outage window**.
     * Calculates the **Shadow Efficiency Index (SEI)**:
       $$\\text{SEI} = 1 - \\frac{\\text{Actual Bundled Outage Hours}}{\\sum \\text{Isolated Department Hours}}$$
       (Demonstrates 50–65% reduction in total line downtime to the judges).
  3. Wire the frontend **BDMS Tab** in `DashboardPage.js` allowing controllers to view submitted maintenance requests, click **"AI Auto-Bundle (Shadow Block)"**, and witness all 3 departments assigned to a single scheduled window.

### Phase 2: Multi-Horizon Time-Space Gantt Matrix (Weekly & Monthly Horizons)
* **Objective:** Fulfill the requirement: *"Provides block plans over multiple time horizons—weekly and monthly"*.
* **Tasks:**
  1. Build a high-performance interactive **Time-Space String Chart / Gantt Matrix** (`frontend/src/components/GanttMatrix.js`):
     * X-axis: Time (hours of the day / days of the week).
     * Y-axis: Kilometers / Station line sections (DLI -> DSA -> ANVR -> SBB -> GZB).
     * Diagonal lines: Passenger and freight train trajectories.
     * Rectangular shaded zones: Multi-department Shadow Maintenance Blocks scheduled during timetable slack.
  2. Interactive slider allowing switching between:
     * **Tactical Horizon (Next 24 Hours)**
     * **Operational Horizon (7-Day Rolling Weekly Plan)**
     * **Strategic Horizon (30-Day Master Maintenance Calendar)**

### Phase 3: Dynamic Temporary Speed Restriction (TSR) & Real-Time Rerouting
* **Objective:** Demonstrate live operational resilience under asset degradation.
* **Tasks:**
  1. When a controller clicks on a track segment and selects **"Apply 30 km/h Caution Order"** (TSR):
     * Backend recalculates sectional transit time for that segment.
     * OR-Tools CP-SAT solver dynamically computes whether to keep high-priority trains on the speed-restricted line or divert them to parallel lines to avoid punctuality loss.
  2. Frontend displays Indian Railways standard yellow/black triangle caution boards on the digital twin canvas.

### Phase 4: Voice Announcement & Gemini LLM Controller Advisory
* **Objective:** Mesmerize evaluators with futuristic multi-modal AI interaction.
* **Tasks:**
  1. Connect `ttsService.js` to browser SpeechSynthesis / Indian Railways station chime for automated train departure and route clearance announcements.
  2. Integrate Google Gemini 1.5 Flash API for natural language justification:
     * Controllers can ask: *"Why did the AI route Train 12004 onto Platform 10 instead of Platform 4?"*
     * Gemini inspects the CP-SAT constraint log and responds with clear operational rationale: *"Platform 4 has an active TRD maintenance block; routing onto Platform 10 prevented an 18-minute cascading delay."*

### Phase 5: Cloud Deployment & Presentation Packaging
* **Objective:** Seamless, fail-proof live demonstration for the jury.
* **Tasks:**
  1. Single-command launch via `start_all.bat` for offline presentation resilience.
  2. Dockerfile & docker-compose configuration for cloud deployment (Render / Railway / Vercel).
  3. Prepare automated demonstration walkthrough showcasing:
     * Instant 120-train simulation.
     * Manual point / signal operation.
     * Active maintenance block injection with real-time shadow bundling and zero-delay train diversion.

---

## 4. How to Run, Test, and Verify

### 4.1 Running the Project Locally
1. **Automated Launch:**
   Double-click `start_all.bat` in the project root.
2. **Manual Backend Launch:**
   ```bash
   cd Backend
   python -m uvicorn main:socket_app --host 0.0.0.0 --port 8002 --reload
   ```
3. **Manual Frontend Launch:**
   ```bash
   cd frontend
   npm start
   ```
   Open `http://localhost:3000` in your web browser and click **"LAUNCH"**.

### 4.2 Verifying Zero Warnings & Compilation
* **Frontend Verification:**
  ```bash
  cd frontend
  npx eslint src
  npm run build
  ```
  *Expected Output:* `Compiled successfully.` with 0 errors and 0 warnings.
* **Backend Verification:**
  ```bash
  python -m py_compile Backend/main.py Backend/simulation.py Backend/optimizer.py
  ```
  *Expected Output:* Clean exit with returncode `0`.

---

## 5. File Structure Reference
```
FlowState-Rail/
├── context.md                             # Master Context & SIH Execution Blueprint (This File)
├── start_all.bat                          # Single-click launcher for Frontend and Backend
├── start_backend.bat                      # Standalone backend launcher (Port 8002)
├── start_frontend.bat                     # Standalone frontend launcher (Port 3000)
├── Backend/
│   ├── main.py                            # FastAPI & Socket.IO server, 0-lag worker thread loop
│   ├── simulation.py                      # Interlocking engine, Direction of Traffic (DOT), BFS routing
│   ├── optimizer.py                       # Google OR-Tools CP-SAT conflict solver
│   ├── .env                               # Port configuration (PORT=8002)
│   └── data/
│       ├── dli_layout.json                # Authentic 16-platform EI VDU topology (228 nodes, 268 circuits)
│       ├── dli_schedule.csv               # 120-train high-frequency non-conflicting timetable
│       ├── corridor_layout.json           # Delhi-Ghaziabad Quadruple Corridor layout
│       └── corridor_schedule.csv          # Corridor train schedule
└── frontend/
    ├── package.json                       # React 18 configuration
    ├── .env                               # REACT_APP_API_URL=http://localhost:8002
    ├── public/
    │   ├── index.html                     # Website metadata & title ("Flow")
    │   └── data/
    │       ├── dli_layout.json            # Client-side preview layout
    │       └── corridor_layout.json       # Client-side preview corridor
    └── src/
        ├── App.js                         # Root application state & router
        ├── pages/
        │   ├── HomePage.js                # Minimalist "LAUNCH" portal
        │   └── DashboardPage.js           # CTC operations dashboard
        └── components/
            ├── TrackDiagram.js            # Authentic Indian Railways EI VDU digital twin
            ├── TrackDiagram.css           # Authentic station master VDU dark styles
            ├── LeftSidebar.js             # Station selector & AI control toggles
            └── RightSidebar.js            # AI recommendations panel & telemetry
```
