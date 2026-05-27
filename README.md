# Forecast Studio · S&OP Demo

> Interactive S&OP decision support tool using Kaggle M5 Forecasting-Accuracy data.
> Korean K-beauty scenario reframing. Built as a portfolio piece.

**Live demo**: _coming soon (Vercel deploy)_

---

## What it does

A dual-audience dashboard that turns demand forecasting into interactive decision making:

- **Executive view (`/`)** — KPI cards (예측 적중률, 재고회전율, 서비스레벨), top risk/excess SKU tables, fan chart with confidence intervals + What-if scenario toggle, and an **interactive inventory simulator** (pick a SKU, enter order qty, see 4-week stockout probability shift live).
- **Analyst view (`/analyst`)** — Naive vs Moving Average vs LightGBM comparison, per-SKU time series with P10/P90 fan band, feature importance, and **SHAP force plots** explaining individual predictions.

## Stack

- **ML**: Python 3.11+, [nixtla mlforecast](https://nixtlaverse.nixtla.io/mlforecast/) (LightGBM + quantile), [SHAP](https://shap.readthedocs.io/), [pydantic](https://docs.pydantic.dev/) (schema validation)
- **Frontend**: Next.js 16 App Router, TypeScript, shadcn/ui, Tailwind, Recharts, Pretendard font
- **Data**: [M5 Forecasting-Accuracy](https://www.kaggle.com/competitions/m5-forecasting-accuracy) (Walmart grocery, ~46MB zip) — reframed as Korean cosmetics in the UI layer
- **Hosting**: Vercel (static export)

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  BUILD-TIME (local, one-shot)                            │
│   Kaggle CLI → data/raw/                                 │
│      ↓                                                   │
│   ml/prepare_data → subset.parquet                       │
│      ↓                                                   │
│   ml/features (+ promotion flag)                         │
│      ↓                                                   │
│   ml/baseline + ml/train (LightGBM × 3 quantiles)        │
│      ↓                                                   │
│   ml/scenarios (promo on/off) → ml/evaluate              │
│      ↓                                                   │
│   ml/inventory + ml/explain (SHAP)                       │
│      ↓                                                   │
│   ml/build_dashboard_data → public/data/*.json           │
└─────────────────────┬────────────────────────────────────┘
                      │  pydantic models = single source
                      │  TypeScript types auto-generated
                      ▼
┌──────────────────────────────────────────────────────────┐
│  DEPLOY-TIME (Vercel)                                    │
│   next build → static HTML + JSON → CDN                  │
└──────────────────────────────────────────────────────────┘
```

## Reproducing locally

### Prerequisites

- Python 3.11+ with pip
- Node.js 24+
- Kaggle account with API token at `~/.kaggle/access_token` (new format) or env var `KAGGLE_API_TOKEN`. **Accept M5 competition rules first**: <https://www.kaggle.com/competitions/m5-forecasting-accuracy/rules>

### Steps

```powershell
# 1. Install Python deps
pip install -r ml/requirements.txt

# 2. Download M5 (~46MB zip, ~600MB unzipped)
kaggle competitions download -c m5-forecasting-accuracy -p data/raw
Expand-Archive -Path data\raw\m5-forecasting-accuracy.zip -DestinationPath data\raw\ -Force

# 3. Run ML pipeline (one-shot, ~3-5 min)
python -m ml.build_dashboard_data

# 4. Frontend setup
cd dashboard
npm install
npm run dev
# → open http://localhost:3000
```

### Tests

```powershell
# ML side
pytest ml/ tests/

# Frontend
cd dashboard
npm run test          # vitest
npm run test:e2e      # playwright
```

## Project layout

```
.
├── ml/                # Python build-time pipeline
├── dashboard/         # Next.js app (deployed)
├── data/raw/          # M5 download target (gitignored)
├── data/processed/    # ML subset outputs
├── tests/             # pytest specs
├── scripts/           # helper scripts (download, regen types)
├── DESIGN.md          # full design system + interaction states
├── CEO_PLAN.md        # vision + scope decisions
└── TEST_PLAN.md       # 52 test specs
```

## Design system

See [`DESIGN.md`](./DESIGN.md). Mood: editorial-techy with a K-beauty accent (muted rose). Light-only theme. WCAG AAA body contrast.

## License

Code: MIT. M5 data: Kaggle competition terms (research/educational).
