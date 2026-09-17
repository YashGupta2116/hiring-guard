# Career Compass — AI-Powered Resume Analyzer & ATS Score Checker

**Career Compass** is a full-stack web application designed to evaluate resume compatibility against target job descriptions, calculate ATS (Applicant Tracking System) scores, pinpoint keyword gaps, check resume structure completeness, offer actionable improvement suggestions, and recommend top matching jobs.

---

## Visual Design System & Aesthetics
- **Palette**:
  - Deep Navy (`#16213D`): Primary Ink / Headers / Accents
  - Cool Off-White (`#EEF0F4`): Page background
  - Warm Brass/Gold (`#C08A2E`): Primary accent / Compass highlights / Call-To-Action
  - Muted Slate (`#5B6478`): Secondary text & captions
  - Success Green (`#3F7D5C`): Matched keywords & strong match indicator
  - Alert Coral (`#C1553F`): Missing keywords & action item alerts
  - Hairline Border (`#D8DBE3`): Subtle 1px borders
- **Typography**:
  - Headings & Display: `Fraunces` (Serif)
  - Body & UI Text: `IBM Plex Sans` (Sans-serif)
  - Scores, Metrics, & Data Tags: `IBM Plex Mono` (Monospace)
- **Signature UI Element**: Custom SVG Compass/Gauge Dial (semicircular arc with tick marks, glowing brass needle, score reading in `IBM Plex Mono`, and verdict badge).

---

## Key Features

1. **Multi-Format Resume Upload**: Supports drag-and-drop or file selection for PDF and DOCX files. Parses raw text server-side using `pdf-parse` and `mammoth`.
2. **Explainable Local NLP Engine**:
   - Tokenization & lowercase normalization
   - Stopword removal using `stopword` package + domain noise filtering
   - Frequency-ranked keyword extraction from job descriptions
   - Keyword overlap calculation (Matched vs. Missing tags)
3. **ATS Compass Score Dial**: Custom SVG semicircular gauge needle visualizer with color zones and verdict indicator (*Needs work* <40%, *Moderate match* 40-70%, *Strong match* 70%+).
4. **Section Verification Checklist**: Regex-based detection for Contact Info, Skills, Work Experience, Projects, and Education sections.
5. **Actionable Improvement Suggestions**: Rule-based feedback for missing keywords, formatting, section labels, and action verb usage.
6. **Cosine Job Recommendation Engine**: Ranks seeded job postings by vector similarity to the candidate's resume and presents top 5 matches.
7. **Database Persistence & Analysis History**: Saves audits to MongoDB so candidates can review past analyses anytime.

---

## Tech Stack

- **Frontend**: React.js, Vite, Tailwind CSS, Lucide Icons, React Router DOM, Axios
- **Backend**: Node.js, Express.js, Multer, `pdf-parse`, `mammoth`, `stopword`
- **Database**: MongoDB & Mongoose (with automatic `MongoMemoryServer` fallback for 0-config local demoing)

---

## Getting Started & Local Installation

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### 1. Install Dependencies
Run from the root directory to install packages across the monorepo:
```bash
npm run install:all
```
*(Or install individually inside `/server` and `/client` directories using `npm install`)*

### 2. Environment Variables Configuration
Check the `.env.example` files in both `/server` and `/client`.

- **Server Environment (`server/.env`)**:
  ```env
  PORT=5001
  MONGODB_URI=mongodb://127.0.0.1:27017/career_compass
  GEMINI_API_KEY=
  ```

  *(Note: If standard MongoDB is not running locally, the server will automatically launch an in-memory database fallback (`mongodb-memory-server`) so you can demo the application instantly!)*

- **Client Environment (`client/.env`)**:
  ```env
  VITE_API_BASE_URL=/api
  ```

### 3. Seed Sample Job Postings
Populate MongoDB with sample job postings for the recommendation engine:
```bash
npm run seed
```

### 4. Run Development Servers
Start both backend (Port 5001) and frontend (Port 3000) concurrently:
```bash
npm run dev
```

Open your browser and visit: **`http://localhost:3000`**


---

## API Endpoints Summary

| Method | Endpoint | Description |
| flex | --- | --- |
| `POST` | `/api/resumes/upload` | Upload & parse resume file (PDF/DOCX) |
| `POST` | `/api/analyze` | Calculate ATS score, keyword gap, section checks & suggestions |
| `GET` | `/api/jobs/recommendations/:resumeId` | Get top 5 ranked job recommendations via cosine similarity |
| `GET` | `/api/jobs` | Get all seeded job postings |
| `GET` | `/api/history` | List past saved analysis logs |
| `GET` | `/api/history/:id` | Get detailed report for a specific past analysis |
| `DELETE`| `/api/history/:id` | Delete an analysis record |

---

## Academic & Demo Presentation Highlights
- **Explainability**: Demonstrates transparent tokenization and term frequency metrics, ideal for defense in front of project evaluation panels.
- **Zero Friction**: In-memory database fallback ensures 0-setup execution on any evaluator machine.
- **Custom Visuals**: Semicircular SVG dial crafted without external chart dependencies.
