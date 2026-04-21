<div align="center">

<br />

<img src="https://img.shields.io/badge/NEXUS_AI-Reconciliation_Intelligence-7c3aed?style=for-the-badge&logoColor=white" alt="NEXUS AI" />

<br /><br />

[![CI/CD Pipeline](https://github.com/Vicky-cmd-run/reconcilation-ai/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/Vicky-cmd-run/reconcilation-ai/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg?style=flat-square)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/react-19-61dafb.svg?style=flat-square&logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Vite](https://img.shields.io/badge/Vite-8.0-646cff.svg?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

<br />

**Enterprise-grade AI reconciliation for the FMCG industry.**  
Upload company & customer CSVs → get severity-ranked discrepancies with full Explainable AI in seconds.

<br />

[**Live Demo**](https://reconcilation-ai.vercel.app) · [**API Docs**](https://your-backend.up.railway.app/docs) · [**Report a Bug**](https://github.com/Vicky-cmd-run/reconcilation-ai/issues)

</div>

---

## ✨ What Is NEXUS AI?

NEXUS AI is a production-grade **FMCG invoice reconciliation platform** powered by Google Gemini. It automatically detects every mismatch between your company's internal records and customer-reported invoices, classifies each discrepancy by severity, and generates a plain-English explanation with a concrete action item — all without a single line of manual analysis.

> **Built for:** Finance teams, supply chain auditors, and FMCG operations who need to close their books faster and dispute fewer invoices.

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🤖 **Gemini-powered XAI** | Root cause classification + plain-English explanation for every discrepancy |
| 🎯 **Severity triage** | Automatic High / Medium / Low prioritization so you tackle the biggest issues first |
| 📊 **Interactive dashboard** | Donut chart + bar chart + filterable data table with search |
| 🔍 **Drill-down modal** | Click any invoice for a side-by-side comparison, delta callout, and AI analysis |
| 📥 **CSV export** | One-click export of the full analysis for audit trails |
| ⚡ **Response caching** | LRU cache on LLM calls for sub-second repeat queries |
| 🔒 **Security headers** | CSP, X-Frame-Options, and rate limiting out of the box |
| 🐳 **Docker-ready** | Full-stack `docker-compose` with multi-stage builds |
| ☁️ **Vercel deploy** | Frontend deploys to Vercel in one click |

---

## 🖥️ Screenshots

> Upload view with drag-and-drop zone and feature capability pills

```
┌─────────────────────────────────────────────────────────────┐
│  NEXUS AI                                                   │
│  ┌──────────┐                                               │
│  │ Import   │   Data Reconciliation Studio                  │
│  │  Data  ● │   ─────────────────────────────────────────  │
│  │          │   ┌─────────────────┐ ┌─────────────────┐   │
│  │ AI       │   │  Company Records │ │ Customer Invoices│   │
│  │Dashboard │   │  Drop CSV here  │ │  Drop CSV here  │   │
│  │          │   └─────────────────┘ └─────────────────┘   │
│  │          │                                               │
│  │● Engine  │   ▶ Run Reconciliation                       │
│  │  Ready   │                                               │
└──┴──────────┴─────────────────────────────────────────────┘
```

---

## 🏗️ Architecture

```
reconciliation-ai/
├── api.py                  # FastAPI — /api/reconcile, /health, /cache/*
├── app.py                  # Streamlit fallback UI
├── config.py               # Pydantic settings with validation
├── src/
│   ├── extractor.py        # CSV loading & normalization
│   ├── matcher.py          # Vectorized mismatch detection (pandas)
│   ├── analyzer.py         # Gemini LLM integration + LRU cache + retry
│   └── formatter.py        # Result shaping for API response
├── frontend/               # React 19 + TypeScript + Vite 8
│   ├── src/
│   │   ├── App.tsx         # Main SPA — upload, dashboard, modal
│   │   ├── components/
│   │   │   ├── Toast.tsx   # Animated toast notifications
│   │   │   └── ErrorBoundary.tsx
│   │   └── utils/
│   │       └── api.ts      # Axios client with interceptors
│   ├── vercel.json         # Vercel deploy config (SPA rewrites + headers)
│   └── Dockerfile          # Multi-stage Nginx build
├── tests/                  # pytest suite — matcher, analyzer, api, config
├── Dockerfile              # Python backend image
├── docker-compose.yml      # Full-stack stack (api + frontend)
├── DEPLOYMENT.md           # Vercel + Railway deployment notes
└── .github/workflows/      # CI: lint, test, type-check
```

**Data flow:**

```
CSV Upload → FastAPI → extractor.py (normalize)
                     → matcher.py   (vectorized diff, O(n))
                     → analyzer.py  (Gemini XAI, cached)
                     → formatter.py (shape response)
                     → JSON → React Dashboard
```

---

## ⚡ Quick Start

### Prerequisites

- Python **3.11+**
- Node.js **20+**
- [Google Gemini API key](https://makersuite.google.com/app/apikey) *(optional — falls back to rule-based analysis)*

### 1 — Clone & configure

```bash
git clone https://github.com/Vicky-cmd-run/reconcilation-ai.git
cd reconcilation-ai

cp .env.example .env
# Edit .env → set GEMINI_API_KEY
```

### 2 — Start the backend

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python api.py
# → http://localhost:8000
# → Swagger UI: http://localhost:8000/docs
```

### 3 — Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# VITE_API_URL=http://localhost:8000
npm run dev
# → http://localhost:5173
```

### 4 — (Optional) Full stack with Docker

```bash
docker-compose up --build
# Frontend → http://localhost:3000
# API      → http://localhost:8000
```

---

## ☁️ Deploy to Vercel

### Frontend (one-click)

1. Fork / push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your repo
3. Set **Root Directory** → `frontend`
4. Vercel auto-detects Vite — click **Deploy**
5. Add environment variable:
   - `VITE_API_URL` → your backend URL (e.g. `https://your-api.up.railway.app`)

> `frontend/vercel.json` is already committed — it handles SPA rewrites, security headers, and long-term asset caching automatically.

### Backend (Railway / Render)

The FastAPI backend can be deployed on any platform that runs Python:

**Railway (recommended):**
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
# Set env var: GEMINI_API_KEY
```

**Render:** Point to `Dockerfile` — set start command `python api.py`.

---

## 🔌 API Reference

### `POST /api/reconcile`

Upload two CSV files and receive a full reconciliation analysis.

**Request** — `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `company_file` | `.csv` | Company's internal invoice records |
| `customer_file` | `.csv` | Customer-reported invoice data |

**CSV format** (both files must share this schema):

```csv
invoice_id,quantity,price
INV-001,100,45.50
INV-002,200,30.00
```

**Response** — `200 OK`

```json
{
  "status": "success",
  "message": "Found 3 mismatches.",
  "data": [
    {
      "invoice_id": "INV-002",
      "issue_type": "Quantity Discrepancy",
      "severity": "Medium",
      "reason": "Quantity mismatch: company recorded 200 units, customer reported 190.",
      "suggested_action": "Cross-reference with delivery notes and POD documents.",
      "explanation": "The 10-unit delta (5%) suggests a potential short-delivery or data entry error...",
      "confidence": "0.87",
      "company_qty": 200,
      "customer_qty": 190,
      "company_price": 30.0,
      "customer_price": 30.0
    }
  ],
  "statistics": {
    "total_mismatches": 3,
    "missing_invoices": 1,
    "quantity_mismatches": 2,
    "price_mismatches": 0,
    "total_discrepancy_value": 1500.00
  }
}
```

### Other Endpoints

```
GET  /health            # Full system health check
GET  /health/live       # Liveness probe (Kubernetes)
GET  /health/ready      # Readiness probe (Kubernetes)
GET  /api/cache/stats   # LRU cache statistics
POST /api/cache/clear   # Clear LLM response cache
GET  /api/statistics    # App config & model info
```

---

## ⚙️ Configuration

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | *(required for AI)* | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | LLM model to use |
| `API_PORT` | `8000` | FastAPI port |
| `ALLOWED_ORIGINS` | `localhost:5173,...` | CORS allowed origins |
| `LLM_CACHE_ENABLED` | `true` | Cache LLM responses |
| `LLM_CACHE_SIZE` | `1000` | LRU cache max entries |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `RATE_LIMIT_REQUESTS` | `100` | Requests per minute |
| `MAX_FILE_SIZE_MB` | `10` | Max upload size per file |
| `DEBUG` | `false` | Debug logging |

---

## 🧪 Testing

```bash
# All tests
pytest

# With coverage report
pytest --cov=. --cov-report=html

# Specific module
pytest tests/test_matcher.py -v

# Type checking
mypy .
```

---

## 🔐 Security

- **Rate limiting** — 100 req/min per IP by default
- **File validation** — size limit + CSV schema enforcement
- **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options (via Vercel config)
- **CORS** — restricted to configured origins
- **No secrets in repo** — `.env` is gitignored; use platform secrets for production

---

## 🤝 Contributing

1. Fork the repo
2. Create a branch — `git checkout -b feature/your-feature`  
3. Commit — `git commit -m 'feat: add your feature'`
4. Push — `git push origin feature/your-feature`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) and PEP 8 / TypeScript strict mode.

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ using [FastAPI](https://fastapi.tiangolo.com/) · [React 19](https://react.dev/) · [Vite](https://vitejs.dev/) · [Google Gemini](https://ai.google.dev/) · [Recharts](https://recharts.org/) · [Framer Motion](https://www.framer.com/motion/)

</div>
