import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileText, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, DollarSign, Activity, Download, Search,
  ChevronRight, X, BarChart2, Cpu, Shield, Zap, RefreshCw,
  Brain, Lightbulb, GitBranch, Eye, Sparkles, Play, Database
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { reconciliationApi } from './utils/api';
import { useToast, ToastContainer } from './components/Toast';
import './App.css';

// ─── Utility ──────────────────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DiscrepancyResult {
  invoice_id: string;
  issue_type: string;
  severity: 'Low' | 'Medium' | 'High';
  reason: string;
  suggested_action: string;
  explanation: string;
  confidence: string | number;
  company_qty: number;
  customer_qty: number;
  company_price: number;
  customer_price: number;
  // XAI-specific fields
  xai_factors?: XAIFactor[];
  xai_decision_path?: string[];
  similar_cases?: number;
  resolution_priority?: number;
  financial_impact?: number;
}

interface XAIFactor {
  factor: string;
  weight: number;
  direction: 'contributing' | 'mitigating';
  description: string;
}

// ─── Synthetic Demo Data ───────────────────────────────────────────────────────
const SYNTHETIC_DEMO: DiscrepancyResult[] = [
  {
    invoice_id: "INV-2024-0891",
    issue_type: "Pricing Discrepancy",
    severity: "High",
    reason: "Trade discount of 12% not reflected in company records. Customer applied negotiated seasonal rebate under contract clause §4.2(b) signed in Q3 2024, but ERP system failed to sync the updated price list.",
    suggested_action: "Pull signed contract amendment from document vault, verify rebate clause applicability, issue credit note for ₹18,400. Escalate to pricing team for ERP sync audit.",
    explanation: "The model classified this as High severity Pricing Discrepancy based on three converging signals: (1) price delta of 12.3% exceeds the ±5% soft-tolerance band defined in our anomaly rules, (2) quantity matches exactly — ruling out partial delivery, and (3) the invoice date falls within a documented rebate window. Historical pattern: 87% of similar cases in the last 6 months were resolved via credit notes.",
    confidence: 0.91,
    company_qty: 500,
    customer_qty: 500,
    company_price: 149.8,
    customer_price: 131.4,
    financial_impact: 9200,
    resolution_priority: 1,
    similar_cases: 23,
    xai_factors: [
      { factor: "Price Delta", weight: 0.38, direction: "contributing", description: "12.3% deviation — exceeds 5% tolerance hard limit" },
      { factor: "Quantity Match", weight: 0.22, direction: "mitigating", description: "Identical quantity confirms delivery was complete" },
      { factor: "Contract Window", weight: 0.28, direction: "contributing", description: "Invoice date aligns with Q3 rebate period" },
      { factor: "Historical Pattern", weight: 0.12, direction: "contributing", description: "87% base rate for pricing errors on this customer" }
    ],
    xai_decision_path: [
      "Quantities match → not a delivery issue",
      "Price delta = 12.3% → above 5% threshold → pricing issue",
      "Invoice date in rebate window → likely contract rebate not applied",
      "→ HIGH severity: financial impact ₹9,200"
    ]
  },
  {
    invoice_id: "INV-2024-0934",
    issue_type: "Quantity Discrepancy",
    severity: "High",
    reason: "Short shipment detected. Company records show 300 units dispatched but customer goods receipt note (GRN) confirms only 247 units received. Loading bay CCTV review showed 53 units returned due to packaging damage during transit.",
    suggested_action: "Cross-reference with logistics partner's (BlueDart) delivery manifest. File damaged-goods claim. Issue credit note for 53 units × ₹85 = ₹4,505. Trigger supplier quality investigation.",
    explanation: "Confidence is 0.88 based on: (1) 17.7% quantity shortfall consistently above the 10% threshold for high classification, (2) unit price identical — pricing model is not in dispute, (3) this SKU (FMCG-DRY-2201) has a 34% historical damage rate during summer transit, (4) the gap of 53 is a precise number not consistent with a counting error — more likely a documented partial return.",
    confidence: 0.88,
    company_qty: 300,
    customer_qty: 247,
    company_price: 85.0,
    customer_price: 85.0,
    financial_impact: 4505,
    resolution_priority: 2,
    similar_cases: 34,
    xai_factors: [
      { factor: "Qty Delta", weight: 0.45, direction: "contributing", description: "17.7% shortfall — above 10% high-severity threshold" },
      { factor: "Price Match", weight: 0.20, direction: "mitigating", description: "Prices identical — isolated to delivery issue only" },
      { factor: "SKU Damage Rate", weight: 0.25, direction: "contributing", description: "This SKU has 34% summer transit damage history" },
      { factor: "Exact Gap", weight: 0.10, direction: "contributing", description: "53 units — precise, not a rounding/counting error" }
    ],
    xai_decision_path: [
      "Price match → not a pricing dispute",
      "Qty delta = 53 units (17.7%) → above 10% threshold",
      "SKU damage history is elevated → likely transit loss",
      "→ HIGH severity: 53 units × ₹85 = ₹4,505 impact"
    ]
  },
  {
    invoice_id: "INV-2024-1012",
    issue_type: "Missing Invoice",
    severity: "High",
    reason: "Invoice appears in company books but customer has zero record. This pattern matches systemic invoicing without delivery confirmation — either invoice was raised prematurely (before dispatch confirmation) or goods are in transit and GRN not yet registered.",
    suggested_action: "Verify dispatch status with warehouse management system. If goods are in-transit, monitor GRN for next 48 hours. If not dispatched, reverse the invoice immediately and investigate premature billing.",
    explanation: "Zero-value customer record triggered Missing Invoice classification. The model assigns High severity because: (1) total exposure is ₹60,000 (300 units × ₹200), (2) customer completely unaware — full dispute risk, (3) this is the 3rd invoice for customer CUST-4412 this quarter with no matching GRN, suggesting a systemic workflow gap in the sales-to-logistics handoff.",
    confidence: 0.94,
    company_qty: 300,
    customer_qty: 0,
    company_price: 200.0,
    customer_price: 0.0,
    financial_impact: 60000,
    resolution_priority: 1,
    similar_cases: 8,
    xai_factors: [
      { factor: "Zero Customer Record", weight: 0.50, direction: "contributing", description: "Complete absence — highest risk classification trigger" },
      { factor: "Full Exposure", weight: 0.30, direction: "contributing", description: "₹60,000 at risk — no partial delivery to offset" },
      { factor: "Repeat Pattern", weight: 0.15, direction: "contributing", description: "3rd unmatched invoice for CUST-4412 this quarter" },
      { factor: "Customer History", weight: 0.05, direction: "mitigating", description: "Customer A-rated — unlikely to be fraudulent denial" }
    ],
    xai_decision_path: [
      "Customer qty = 0 → no GRN record exists",
      "Company price and qty both non-zero → invoice raised",
      "3rd occurrence for CUST-4412 → systemic pattern flag",
      "→ HIGH severity: full exposure ₹60,000"
    ]
  },
  {
    invoice_id: "INV-2024-0876",
    issue_type: "Claims Issue",
    severity: "Medium",
    reason: "Customer applied returns deduction of ₹2,200 (20 units returned) but the return authorization (RA) number is not logged in company's RMS. The deduction was made unilaterally without prior approval per trade terms.",
    suggested_action: "Request RA documentation from customer. If valid, process credit note within 5 business days per SLA. If no valid RA, issue debit note and flag as unauthorized deduction. Review returns policy communication.",
    explanation: "Medium severity because the discrepancy (₹2,200) is within manageable bounds and there is a plausible business reason. However, unilateral deductions without RA represent a process violation. Confidence is 0.82: the exact round-number deduction (20 units) strongly suggests a deliberate return rather than an error. Historical base rate for unauthorized deductions from this customer tier is 40%.",
    confidence: 0.82,
    company_qty: 200,
    customer_qty: 180,
    company_price: 110.0,
    customer_price: 110.0,
    financial_impact: 2200,
    resolution_priority: 3,
    similar_cases: 41,
    xai_factors: [
      { factor: "Round Number Delta", weight: 0.30, direction: "contributing", description: "Exactly 20 units — deliberate return, not counting error" },
      { factor: "Price Match", weight: 0.25, direction: "mitigating", description: "Prices match — confirms this is a quantity/returns issue" },
      { factor: "No RA Found", weight: 0.35, direction: "contributing", description: "Return authorization not in RMS — process violation" },
      { factor: "Impact Size", weight: 0.10, direction: "mitigating", description: "₹2,200 impact — manageable, not critical" }
    ],
    xai_decision_path: [
      "Qty delta = 20 (exact round number) → deliberate action",
      "Price match → not a pricing dispute",
      "No RA in RMS → unauthorized deduction",
      "→ MEDIUM severity: SLA-bound resolution path"
    ]
  },
  {
    invoice_id: "INV-2024-1089",
    issue_type: "Logistics Issue",
    severity: "Medium",
    reason: "Customer invoice shows split delivery across 2 dates but company billed as a single shipment. 80 units were delivered on Day 1 and 70 on Day 3. Customer's system recorded two separate GRNs but the pending 70 units triggered a price recalculation at Day 3's list price.",
    suggested_action: "Reconcile delivery dates with logistics manifest. Issue split invoice for Day 3 delivery using applicable price list. Update billing workflow to handle split deliveries without single-batch invoicing.",
    explanation: "The 7 unit discrepancy maps to a price recalculation triggered by split delivery. The model identified this via: (1) small unit delta (7 units = 4.6%) is below high-severity threshold but quantity mismatch exists, (2) price differential of ₹3.5 per unit aligns exactly with price list change between dates, (3) this is a common pattern for customers in Zone-B logistics routing where split deliveries occur 38% of the time.",
    confidence: 0.76,
    company_qty: 150,
    customer_qty: 143,
    company_price: 78.5,
    customer_price: 75.0,
    financial_impact: 1084,
    resolution_priority: 4,
    similar_cases: 19,
    xai_factors: [
      { factor: "Qty Delta", weight: 0.25, direction: "contributing", description: "4.6% shortfall — below high threshold, medium classification" },
      { factor: "Price Delta", weight: 0.30, direction: "contributing", description: "₹3.5/unit matches exact price list change on split date" },
      { factor: "Zone-B Routing", weight: 0.25, direction: "contributing", description: "38% base rate for split deliveries in this zone" },
      { factor: "Both Differ", weight: 0.20, direction: "contributing", description: "Both qty and price off — complex logistics scenario" }
    ],
    xai_decision_path: [
      "Both qty and price differ → complex case",
      "Price delta = ₹3.5 aligns with list price change date",
      "Customer in Zone-B → high split-delivery probability",
      "→ MEDIUM severity: logistics reconciliation required"
    ]
  },
  {
    invoice_id: "INV-2024-0803",
    issue_type: "Quantity Discrepancy",
    severity: "Low",
    reason: "Minor quantity variance of 2 units (1.3% off). Likely a counting tolerance error at the warehouse. Customer's GRN shows 148 units received vs 150 invoiced. Within acceptable variance band for bulk goods.",
    suggested_action: "Flag for monthly reconciliation cycle. No immediate action required. If pattern persists across 3+ consecutive invoices for same SKU, escalate to warehouse quality team for recount procedure review.",
    explanation: "Low severity classification with 0.71 confidence. The 1.3% delta is well within the ±2% counting tolerance for this SKU category (bulk dry goods). XAI reasoning: (1) minor absolute delta (2 units, ₹190 impact), (2) price matches exactly, (3) this SKU has a documented ±2% variance tolerance in the trade agreement, (4) no pattern of repeat discrepancies in last 90 days for this customer.",
    confidence: 0.71,
    company_qty: 150,
    customer_qty: 148,
    company_price: 95.0,
    customer_price: 95.0,
    financial_impact: 190,
    resolution_priority: 5,
    similar_cases: 67,
    xai_factors: [
      { factor: "Qty Delta", weight: 0.40, direction: "contributing", description: "1.3% — within ±2% tolerance for bulk goods" },
      { factor: "Price Match", weight: 0.25, direction: "mitigating", description: "Exact price match — isolated counting variance" },
      { factor: "Low Impact", weight: 0.25, direction: "mitigating", description: "₹190 impact — below investigation threshold" },
      { factor: "No Repeat", weight: 0.10, direction: "mitigating", description: "No recurring pattern in 90-day window" }
    ],
    xai_decision_path: [
      "Qty delta = 2 units (1.3%) → within tolerance band",
      "Price match → not a pricing dispute",
      "No repeat pattern → not systemic",
      "→ LOW severity: periodic review cycle"
    ]
  },
  {
    invoice_id: "INV-2024-1134",
    issue_type: "Pricing Discrepancy",
    severity: "Low",
    reason: "Customer applied early payment discount of 1% per agreed dynamic pricing clause. Company invoiced at standard rate without accounting for 15-day early settlement discount. Discount value = ₹240.",
    suggested_action: "Verify payment date against invoice. If payment received within 15 days, approve the 1% discount per contract. Issue credit note ₹240. No escalation required.",
    explanation: "Low confidence (0.68) because the early payment discount clause is sometimes disputed at the amount level. However, the 1% delta (₹2.4/unit on ₹240 price) exactly matches the contractual discount rate — strong signal. The model weighted this as Low because: (1) financial impact is minimal, (2) the discount is contractually valid, (3) customer has a strong payment history.",
    confidence: 0.68,
    company_qty: 100,
    customer_qty: 100,
    company_price: 240.0,
    customer_price: 237.6,
    financial_impact: 240,
    resolution_priority: 6,
    similar_cases: 52,
    xai_factors: [
      { factor: "Exact 1% Delta", weight: 0.45, direction: "contributing", description: "₹2.4/unit = precisely 1% of ₹240 list price" },
      { factor: "Qty Match", weight: 0.20, direction: "mitigating", description: "Quantity identical — purely a pricing nuance" },
      { factor: "Low Impact", weight: 0.20, direction: "mitigating", description: "₹240 total — minimal financial exposure" },
      { factor: "Payment History", weight: 0.15, direction: "mitigating", description: "Customer has 98% on-time payment rate" }
    ],
    xai_decision_path: [
      "Qty match → not a delivery issue",
      "1% price delta → matches early payment discount rate",
      "Contractually valid → not a dispute",
      "→ LOW severity: standard credit note process"
    ]
  },
  {
    invoice_id: "INV-2024-0967",
    issue_type: "Missing Invoice",
    severity: "High",
    reason: "Invoice exists only in customer books — no matching company record found. Customer claims to have received 120 units of SKU-DAIRY-0091 worth ₹10,800 but company has no dispatch record. Possible unauthorized goods received or data entry error in customer ERP.",
    suggested_action: "Immediate audit of distribution partner records for this route. Cross-check customer's GRN with company warehouse dispatch logs. If goods were delivered without company order, investigate potential grey-market supply. If data entry error, correct records and reissue.",
    explanation: "This is a right-only record (customer only) — the inverse of a missing invoice. High severity because: (1) company has zero revenue recorded for ₹10,800 of goods, (2) if goods were actually delivered, this represents an unrecorded cost with no corresponding revenue, (3) the SKU (dairy) has a 6-hour delivery window making unauthorized supply operationally difficult — more likely a data issue, but required immediate review.",
    confidence: 0.86,
    company_qty: 0,
    customer_qty: 120,
    company_price: 0.0,
    customer_price: 90.0,
    financial_impact: 10800,
    resolution_priority: 1,
    similar_cases: 11,
    xai_factors: [
      { factor: "Unrecorded Revenue", weight: 0.40, direction: "contributing", description: "₹10,800 in customer books with zero company record" },
      { factor: "Company Zero Record", weight: 0.35, direction: "contributing", description: "No dispatch evidence — either fraud or data error" },
      { factor: "SKU Constraints", weight: 0.15, direction: "mitigating", description: "Dairy SKU — short window makes unauthorized supply hard" },
      { factor: "Impact Size", weight: 0.10, direction: "contributing", description: "₹10,800 — above immediate-review threshold" }
    ],
    xai_decision_path: [
      "Company qty = 0 → no dispatch record",
      "Customer qty = 120 → GRN exists at customer",
      "Dairy SKU → unlikely unauthorized supply",
      "→ HIGH severity: immediate audit required"
    ]
  }
];

// ─── Constants ────────────────────────────────────────────────────────────────
const SEVERITY_COLORS = { Low: '#10B981', Medium: '#F59E0B', High: '#EF4444' } as const;
const ISSUE_TYPE_COLORS: Record<string, string> = {
  'Pricing Discrepancy': '#818cf8',
  'Quantity Discrepancy': '#f472b6',
  'Missing Invoice': '#f87171',
  'Claims Issue': '#fb923c',
  'Logistics Issue': '#34d399',
};
const MAX_FILE_SIZE_MB = 10;

// ─── XAI Factor Bar ───────────────────────────────────────────────────────────
function XAIFactorBar({ factor }: { factor: XAIFactor }) {
  const isContributing = factor.direction === 'contributing';
  const color = isContributing ? 'from-red-500 to-fuchsia-500' : 'from-emerald-500 to-cyan-500';
  const labelColor = isContributing ? 'text-red-400' : 'text-emerald-400';

  return (
    <div className="group">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-semibold text-slate-300">{factor.factor}</span>
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-bold uppercase tracking-wide', labelColor)}>
            {factor.direction}
          </span>
          <span className="text-xs text-slate-400 font-mono">{Math.round(factor.weight * 100)}%</span>
        </div>
      </div>
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-1">
        <motion.div
          className={cn('h-full rounded-full bg-gradient-to-r', color)}
          initial={{ width: 0 }}
          animate={{ width: `${factor.weight * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">{factor.description}</p>
    </div>
  );
}

// ─── XAI Decision Path ────────────────────────────────────────────────────────
function XAIDecisionPath({ steps }: { steps: string[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-start gap-3"
        >
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 mt-0.5',
              i === steps.length - 1
                ? 'bg-fuchsia-500/30 border border-fuchsia-500/50 text-fuchsia-300'
                : 'bg-white/10 border border-white/15 text-slate-400'
            )}>
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="w-px h-4 bg-gradient-to-b from-white/10 to-transparent mt-1" />
            )}
          </div>
          <p className={cn(
            'text-xs leading-relaxed pt-0.5',
            i === steps.length - 1 ? 'text-fuchsia-300 font-semibold' : 'text-slate-400'
          )}>
            {step}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Custom Recharts Tooltip ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel-dark px-4 py-3 text-sm">
        <p className="text-slate-400 mb-1 font-medium">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.name === 'Company' ? '#818cf8' : '#f472b6' }}>
            {p.name}: <span className="font-bold">₹{p.value?.toLocaleString()}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Confidence Dial ──────────────────────────────────────────────────────────
function ConfidenceDial({ value, size = 80 }: { value: number; size?: number }) {
  const pct = Math.round(value * 100);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value);
  const color = pct >= 85 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-sm font-black" style={{ color }}>{pct}%</p>
      </div>
    </div>
  );
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceModal({ result, onClose }: { result: DiscrepancyResult; onClose: () => void }) {
  const companyTotal = result.company_qty * result.company_price;
  const customerTotal = result.customer_qty * result.customer_price;
  const delta = Math.abs(companyTotal - customerTotal);
  const confidence = Number(result.confidence);

  const [activeXAITab, setActiveXAITab] = useState<'factors' | 'path' | 'reasoning'>('factors');

  const severityConfig = {
    High:   { ring: 'ring-red-500/40 bg-red-500/10',    text: 'text-red-400',    glow: 'shadow-red-500/20',    border: 'border-red-500/20' },
    Medium: { ring: 'ring-amber-500/40 bg-amber-500/10', text: 'text-amber-400',  glow: 'shadow-amber-500/20',  border: 'border-amber-500/20' },
    Low:    { ring: 'ring-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-emerald-500/20', border: 'border-emerald-500/20' },
  }[result.severity];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.92, y: 20  }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-3xl relative z-50 max-h-[92vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Glass Card */}
        <div className={cn('glass-panel shadow-2xl', severityConfig.glow, 'shadow-[0_32px_80px_-8px]')}>
          {/* Decorative gradient blobs */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ background: result.severity === 'High' ? '#ef4444' : result.severity === 'Medium' ? '#f59e0b' : '#10b981' }} />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full blur-3xl opacity-10 pointer-events-none bg-indigo-500" />

          <div className="p-8 relative">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-xs text-slate-500 font-medium tracking-widest uppercase mb-1">Invoice Detail</p>
                <h2 className="text-2xl font-extrabold text-white font-mono">#{result.invoice_id}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border ring-1', severityConfig.ring, severityConfig.text)}>
                    {result.severity} Severity
                  </span>
                  <span className="text-xs text-slate-500 px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                    {result.issue_type}
                  </span>
                  {result.resolution_priority && (
                    <span className="text-xs text-indigo-400 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 font-bold">
                      P{result.resolution_priority}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <ConfidenceDial value={confidence} size={72} />
                  <div className="text-[10px] text-slate-500 mt-1">AI Confidence</div>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Financial Impact', value: `₹${(result.financial_impact ?? delta).toLocaleString()}`, icon: <DollarSign className="w-3 h-3" /> },
                { label: 'Similar Cases', value: `${result.similar_cases ?? '–'} this quarter`, icon: <Database className="w-3 h-3" /> },
                { label: 'Priority', value: result.resolution_priority ? `P${result.resolution_priority} / P6` : '–', icon: <Zap className="w-3 h-3" /> },
              ].map(k => (
                <div key={k.label} className="glass-panel-sm p-3 text-center">
                  <div className="flex justify-center mb-1 text-slate-500">{k.icon}</div>
                  <p className="text-base font-black text-white">{k.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Comparison grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'Company Records', qty: result.company_qty, price: result.company_price, total: companyTotal, color: 'indigo' },
                { label: 'Customer Records', qty: result.customer_qty, price: result.customer_price, total: customerTotal, color: 'fuchsia' },
              ].map((side) => (
                <div key={side.label} className={`glass-panel-sm p-4`}>
                  <p className={`text-xs font-bold tracking-widest uppercase text-${side.color}-400 mb-3`}>{side.label}</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">Quantity</span>
                      <span className="font-mono font-bold">{side.qty.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">Unit Price</span>
                      <span className="font-mono font-bold">₹{side.price.toLocaleString()}</span>
                    </div>
                    <div className="border-t border-white/5 pt-2 flex justify-between">
                      <span className="text-slate-500">Total</span>
                      <span className={`font-mono font-black text-${side.color}-300`}>₹{side.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Delta callout */}
            <div className={cn('rounded-xl p-4 border mb-6 flex items-center justify-between', severityConfig.ring, severityConfig.border)}>
              <span className="text-slate-400 text-sm font-medium">Value Discrepancy</span>
              <span className={cn('text-xl font-black font-mono', severityConfig.text)}>₹{delta.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {/* ── XAI SECTION ── */}
            <div className="glass-panel-sm p-1 mb-4 flex gap-1 rounded-xl">
              {(['factors', 'path', 'reasoning'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveXAITab(tab)}
                  className={cn('flex-1 py-2 rounded-lg text-xs font-bold tracking-wide transition-all capitalize flex items-center justify-center gap-1.5',
                    activeXAITab === tab
                      ? 'bg-gradient-to-r from-violet-600/40 to-fuchsia-600/40 text-white border border-violet-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  )}>
                  {tab === 'factors' ? <><Brain className="w-3 h-3"/>XAI Factors</> :
                   tab === 'path'    ? <><GitBranch className="w-3 h-3"/>Decision Path</> :
                                       <><Eye className="w-3 h-3"/>Full Reasoning</>}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {activeXAITab === 'factors' && result.xai_factors && (
                <motion.div key="factors"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="glass-panel-sm p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-violet-400" />
                    <p className="text-xs font-bold text-slate-300 tracking-widest uppercase">Feature Attribution (SHAP-style)</p>
                  </div>
                  {result.xai_factors.map((f, i) => <XAIFactorBar key={i} factor={f} />)}
                  <p className="text-[10px] text-slate-600 mt-2 italic">
                    Weights represent each factor's proportional contribution to the severity classification decision.
                  </p>
                </motion.div>
              )}
              {activeXAITab === 'path' && result.xai_decision_path && (
                <motion.div key="path"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="glass-panel-sm p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-fuchsia-400" />
                    <p className="text-xs font-bold text-slate-300 tracking-widest uppercase">AI Decision Path</p>
                  </div>
                  <XAIDecisionPath steps={result.xai_decision_path} />
                </motion.div>
              )}
              {activeXAITab === 'reasoning' && (
                <motion.div key="reasoning"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  <div className="glass-panel-sm p-4">
                    <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mb-2 flex items-center gap-2">
                      <Cpu className="w-3 h-3" /> Root Cause
                    </p>
                    <p className="text-slate-200 text-sm leading-relaxed">{result.reason}</p>
                  </div>
                  <div className="glass-panel-sm p-4 border-fuchsia-500/10">
                    <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mb-2 flex items-center gap-2">
                      <Zap className="w-3 h-3 text-amber-400" /> Suggested Action
                    </p>
                    <p className="text-slate-200 text-sm leading-relaxed">{result.suggested_action}</p>
                  </div>
                  <div className="glass-panel-sm p-4 border-indigo-500/10">
                    <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mb-2 flex items-center gap-2">
                      <Shield className="w-3 h-3 text-indigo-400" /> Full AI Explanation
                    </p>
                    <p className="text-slate-300 text-sm leading-relaxed italic">{result.explanation}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, disabled }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left w-full',
        active
          ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-white shadow-inner border border-white/[0.07]'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-200',
        disabled && 'opacity-30 cursor-not-allowed pointer-events-none'
      )}
    >
      <div className={cn('flex-shrink-0 w-5 h-5 transition-colors', active ? 'text-fuchsia-400' : 'group-hover:text-slate-300')}>
        {icon}
      </div>
      <span className="hidden lg:block font-medium text-sm tracking-wide">{label}</span>
      {active && <div className="hidden lg:block w-1.5 h-1.5 rounded-full bg-fuchsia-400 ml-auto animate-pulse" />}
    </button>
  );
}

// ─── File Upload Drop Zone ────────────────────────────────────────────────────
function FileUploadBox({ label, file, setFile, description, color = 'indigo' }: {
  label: string; file: File | null; setFile: (f: File | null) => void;
  description?: string; color?: 'indigo' | 'fuchsia';
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file'); return;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File exceeds ${MAX_FILE_SIZE_MB}MB limit`); return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, []);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn(
        'glass-panel p-8 flex flex-col items-center justify-center text-center relative overflow-hidden cursor-pointer transition-all duration-300 min-h-[200px]',
        isDragging && 'drop-zone-active'
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      onClick={() => !file && inputRef.current?.click()}
    >
      <div className={cn(
        'absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-20 transition-opacity duration-700',
        isDragging ? 'opacity-50' : 'group-hover:opacity-40',
        color === 'indigo' ? 'bg-indigo-500' : 'bg-fuchsia-500'
      )} />

      <input ref={inputRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />

      <AnimatePresence mode="wait">
        {file ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">{file.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1 mt-1"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center border',
              color === 'indigo'
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                : 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400'
            )}>
              {isDragging ? <UploadCloud className="w-7 h-7 animate-bounce" /> : <FileText className="w-7 h-7" />}
            </div>
            <div>
              <p className="font-bold text-slate-200 text-sm">{label}</p>
              {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
              <p className="text-xs text-slate-600 mt-2">Drop CSV here or <span className={cn('font-semibold', color === 'indigo' ? 'text-indigo-400' : 'text-fuchsia-400')}>click to browse</span></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ title, value, icon, sub, variant = 'default' }: {
  title: string; value: string | number; icon: React.ReactNode;
  sub?: string; variant?: 'default' | 'danger' | 'success' | 'warning';
}) {
  const glow = {
    default: 'hover:shadow-violet-500/20',
    danger:  'hover:shadow-red-500/20',
    success: 'hover:shadow-emerald-500/20',
    warning: 'hover:shadow-amber-500/20',
  }[variant];

  return (
    <motion.div
      whileHover={{ y: -3 }}
      className={cn('glass-panel p-6 relative overflow-hidden transition-shadow duration-300 shadow-xl metric-card-glow', glow)}
    >
      <div className="flex justify-between items-start mb-3">
        <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase">{title}</p>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">{icon}</div>
      </div>
      <p className="text-3xl font-black text-white leading-none mb-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </motion.div>
  );
}

// ─── Export helper ────────────────────────────────────────────────────────────
function exportToCSV(results: DiscrepancyResult[]) {
  const headers = ['Invoice ID', 'Issue Type', 'Severity', 'Company Qty', 'Customer Qty', 'Company Price', 'Customer Price', 'Confidence', 'Financial Impact', 'Reason', 'Suggested Action'];
  const rows = results.map(r => [
    r.invoice_id, r.issue_type, r.severity,
    r.company_qty, r.customer_qty, r.company_price, r.customer_price,
    `${Math.round(Number(r.confidence) * 100)}%`,
    r.financial_impact ? `₹${r.financial_impact}` : '',
    `"${r.reason.replace(/"/g, "'")}"`,
    `"${r.suggested_action.replace(/"/g, "'")}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `reconciliation_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Demo Loading Animation ────────────────────────────────────────────────────
function DemoLoader({ onComplete }: { onComplete: () => void }) {
  const steps = [
    'Loading synthetic FMCG dataset…',
    'Running vectorized outer-join merge…',
    'Classifying 8 discrepancy patterns…',
    'Computing SHAP-style XAI factor weights…',
    'Generating decision paths…',
    'Analysis complete ✓'
  ];
  const [currentStep, setCurrentStep] = useState(0);

  React.useEffect(() => {
    if (currentStep < steps.length - 1) {
      const t = setTimeout(() => setCurrentStep(s => s + 1), 400);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [currentStep]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <div className="glass-panel p-10 max-w-md w-full mx-4 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30">
          <Brain className="w-8 h-8 text-white animate-pulse" />
        </div>
        <h3 className="text-xl font-black text-white mb-2">AI Engine Running</h3>
        <p className="text-slate-500 text-sm mb-8">Synthetic FMCG reconciliation demo</p>
        <div className="space-y-2 text-left mb-6">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: i <= currentStep ? 1 : 0.2, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className={cn('w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center',
                i < currentStep ? 'bg-emerald-500' : i === currentStep ? 'bg-violet-500 animate-pulse' : 'bg-white/10'
              )}>
                {i < currentStep && <CheckCircle className="w-3 h-3 text-white" />}
              </div>
              <p className={cn('text-xs', i <= currentStep ? 'text-slate-200' : 'text-slate-600')}>{step}</p>
            </motion.div>
          ))}
        </div>
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [results, setResults] = useState<DiscrepancyResult[] | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard'>('upload');
  const [selectedInvoice, setSelectedInvoice] = useState<DiscrepancyResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [isDemoMode, setIsDemoMode] = useState(false);

  const { toasts, addToast, removeToast } = useToast();

  // ── Demo Mode Handler ──
  const handleLoadDemo = () => {
    setDemoLoading(true);
  };

  const handleDemoComplete = () => {
    setDemoLoading(false);
    setIsDemoMode(true);
    setResults(SYNTHETIC_DEMO);
    setActiveTab('dashboard');
    addToast('Synthetic FMCG demo loaded — 8 discrepancies with full XAI analysis', 'success');
    addToast('Total exposure: ₹86,019 across 3 High, 2 Medium, 2 Low severity cases', 'info');
  };

  // ── Real Upload Handler ──
  const handleReconcile = async () => {
    if (!companyFile || !customerFile) { addToast('Please upload both files.', 'error'); return; }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    if (companyFile.size > maxBytes) { addToast(`Company file exceeds ${MAX_FILE_SIZE_MB}MB`, 'error'); return; }
    if (customerFile.size > maxBytes) { addToast(`Customer file exceeds ${MAX_FILE_SIZE_MB}MB`, 'error'); return; }

    setLoading(true);
    try {
      const res = await reconciliationApi.reconcile(companyFile, customerFile);
      if (res.status === 'success') {
        setResults(res.data);
        setIsDemoMode(false);
        setActiveTab('dashboard');
        addToast(res.message || 'Analysis complete!', 'success');
        if ((res.statistics?.total_mismatches ?? 0) > 0) {
          addToast(`${res.statistics!.total_mismatches} mismatches · ₹${res.statistics!.total_discrepancy_value?.toLocaleString() ?? 0} at risk`, 'info');
        }
      } else {
        addToast('Reconciliation completed with issues.', 'warning');
      }
    } catch (err: unknown) {
      let msg = 'Failed to run reconciliation. Is the API server running?';
      if (err instanceof Error) {
        if (err.message.includes('Network Error') || err.message.includes('fetch')) {
          msg = 'Cannot connect to API — ensure the backend is running on port 8000.';
        } else {
          msg = err.message;
        }
      }
      addToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null); setActiveTab('upload');
    setCompanyFile(null); setCustomerFile(null);
    setSearchQuery(''); setSeverityFilter('All');
    setIsDemoMode(false);
  };

  // ── Derived metrics ──
  const mismatchCount = results?.length ?? 0;
  const highSevCount  = results?.filter(r => r.severity === 'High').length ?? 0;
  const avgConfidence = results?.length
    ? Math.round(results.reduce((s, r) => s + Number(r.confidence), 0) / results.length * 100)
    : 0;
  const totalValue = results?.reduce((acc, r) => acc + (r.financial_impact ?? Math.abs(r.company_qty * r.company_price - r.customer_qty * r.customer_price)), 0) ?? 0;

  // ── Filtered results ──
  const filtered = (results ?? []).filter(r => {
    const matchSev = severityFilter === 'All' || r.severity === severityFilter;
    const matchQ = !searchQuery || r.invoice_id.toLowerCase().includes(searchQuery.toLowerCase())
      || r.issue_type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSev && matchQ;
  });

  // ── Chart data ──
  const pieData = results
    ? Object.entries(results.reduce((acc, r) => { acc[r.severity] = (acc[r.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>))
        .map(([name, value]) => ({ name, value }))
    : [];

  const barData = (results ?? []).slice(0, 10).map(r => ({
    id: r.invoice_id.replace('INV-2024-', '#'),
    Company: r.company_qty * r.company_price,
    Customer: r.customer_qty * r.customer_price,
  }));

  const issueTypeData = results
    ? Object.entries(results.reduce((acc, r) => { acc[r.issue_type] = (acc[r.issue_type] ?? 0) + 1; return acc; }, {} as Record<string, number>))
        .map(([name, value]) => ({ name, value }))
    : [];

  const radarData = results ? [
    { subject: 'Pricing', value: results.filter(r => r.issue_type === 'Pricing Discrepancy').length },
    { subject: 'Quantity', value: results.filter(r => r.issue_type === 'Quantity Discrepancy').length },
    { subject: 'Missing', value: results.filter(r => r.issue_type === 'Missing Invoice').length },
    { subject: 'Claims', value: results.filter(r => r.issue_type === 'Claims Issue').length },
    { subject: 'Logistics', value: results.filter(r => r.issue_type === 'Logistics Issue').length },
  ] : [];

  const avgXAIConfidence = results && isDemoMode
    ? Math.round(results.reduce((s, r) => s + Number(r.confidence), 0) / results.length * 100)
    : avgConfidence;

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Demo loader overlay */}
      <AnimatePresence>
        {demoLoading && <DemoLoader onComplete={handleDemoComplete} />}
      </AnimatePresence>

      {/* Invoice detail modal */}
      <AnimatePresence>
        {selectedInvoice && (
          <InvoiceModal result={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}
      </AnimatePresence>

      <div className="flex h-screen overflow-hidden text-slate-100 relative z-10">
        {/* ── Sidebar ── */}
        <nav className="w-[72px] lg:w-60 flex flex-col border-r border-white/[0.05] z-20 p-3 m-3 rounded-2xl h-[calc(100vh-1.5rem)] glass-panel-dark shadow-2xl flex-shrink-0">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 px-1 mt-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="hidden lg:block">
              <p className="font-black text-white text-base tracking-tight leading-none">NEXUS AI</p>
              <p className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">Reconciliation</p>
            </div>
          </div>

          {/* Nav links */}
          <div className="flex flex-col gap-1 flex-1">
            <p className="hidden lg:block text-[10px] text-slate-600 font-bold tracking-widest uppercase px-3 mb-2">Workflow</p>
            <NavItem icon={<UploadCloud />} label="Import Data"   active={activeTab === 'upload'}    onClick={() => setActiveTab('upload')} />
            <NavItem icon={<BarChart2 />}   label="AI Dashboard"  active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} disabled={!results} />

            {isDemoMode && (
              <>
                <p className="hidden lg:block text-[10px] text-slate-600 font-bold tracking-widest uppercase px-3 mb-1 mt-4">Demo Mode</p>
                <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 mx-0">
                  <Sparkles className="w-3.5 h-3.5 text-fuchsia-400 flex-shrink-0" />
                  <span className="text-[10px] text-fuchsia-300 font-semibold leading-tight">Synthetic data · XAI active</span>
                </div>
              </>
            )}
          </div>

          {/* Status pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] mt-auto">
            <div className="pulse-dot" />
            <span className="text-xs text-slate-500">Engine Ready</span>
          </div>
        </nav>

        {/* ── Main Content ── */}
        <main className="flex-1 h-full overflow-y-auto custom-scrollbar p-4">
          <AnimatePresence mode="wait">

            {/* ─── Upload View ─── */}
            {activeTab === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0  }}
                exit={{   opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
                className="mt-8 mx-auto max-w-3xl"
              >
                {/* Hero */}
                <div className="mb-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold tracking-wider uppercase mb-4">
                    <Cpu className="w-3 h-3" /> Explainable AI Engine
                  </div>
                  <h1 className="text-4xl lg:text-5xl font-black mb-3 leading-tight">
                    <span className="gradient-fuchsia">Data Reconciliation</span>
                    <br /><span className="text-white">Studio</span>
                  </h1>
                  <p className="text-slate-400 text-lg max-w-xl leading-relaxed">
                    Upload company and customer records. Our AI engine detects every discrepancy, assigns severity, and provides defensible explanations — instantly.
                  </p>
                </div>

                {/* ── DEMO BANNER ── */}
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="relative overflow-hidden rounded-2xl mb-8 cursor-pointer group"
                  onClick={handleLoadDemo}
                >
                  {/* Background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-violet-600/25 via-fuchsia-600/20 to-indigo-600/25 rounded-2xl" />
                  <div className="absolute inset-0 border border-violet-500/30 rounded-2xl" />
                  {/* Moving glow */}
                  <div className="absolute -top-8 -left-8 w-40 h-40 bg-violet-500 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
                  <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-fuchsia-500 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />

                  <div className="relative p-6 flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/30 flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-black text-white text-lg">Try Live Demo</p>
                        <span className="text-[10px] bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 px-2 py-0.5 rounded-full font-bold tracking-wide uppercase">XAI Showcase</span>
                      </div>
                      <p className="text-slate-400 text-sm leading-relaxed">
                        Load 8 synthetic FMCG invoices with rich Explainable AI analysis — SHAP-style factor weights, decision paths, and full reasoning chains. No files needed.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {['8 Discrepancies', '3 Severity Levels', 'SHAP Factors', 'Decision Trees', '₹86,019 at Risk'].map(t => (
                          <span key={t} className="text-[10px] text-slate-400 bg-white/5 border border-white/10 px-2 py-1 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-sm flex-shrink-0 shadow-lg shadow-fuchsia-500/30 group-hover:shadow-fuchsia-500/50 transition-all">
                      <Play className="w-4 h-4" />
                      Run Demo
                    </div>
                  </div>
                </motion.div>

                {/* Upload cards */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-white/5" />
                  </div>
                  <div className="relative flex justify-center mb-6">
                    <span className="px-3 py-1 text-xs text-slate-600 bg-slate-950 rounded-full border border-white/5">— or upload your own files —</span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-5 mb-6">
                  <FileUploadBox
                    label="Company Records"
                    description="Internal invoices · columns: invoice_id, quantity, price"
                    file={companyFile}
                    setFile={setCompanyFile}
                    color="indigo"
                  />
                  <FileUploadBox
                    label="Customer Invoices"
                    description="Customer-reported data · same CSV schema"
                    file={customerFile}
                    setFile={setCustomerFile}
                    color="fuchsia"
                  />
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    id="btn-run-reconciliation"
                    onClick={handleReconcile}
                    disabled={loading || !companyFile || !customerFile}
                    className="btn-glow text-white flex items-center gap-3"
                  >
                    {loading ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing Records…</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Run Reconciliation</>
                    )}
                  </button>

                  {(companyFile || customerFile) && (
                    <button onClick={handleReset} className="text-sm text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5">
                      <X className="w-4 h-4" /> Clear
                    </button>
                  )}
                </div>

                <p className="text-slate-600 text-xs mt-5">Max {MAX_FILE_SIZE_MB}MB per file · CSV format only</p>

                {/* Feature pills */}
                <div className="flex flex-wrap gap-3 mt-10">
                  {[
                    { icon: <Shield className="w-3.5 h-3.5" />, text: 'Severity-based triage' },
                    { icon: <Brain className="w-3.5 h-3.5" />,  text: 'SHAP-style XAI factors' },
                    { icon: <GitBranch className="w-3.5 h-3.5" />, text: 'Decision path tracing' },
                    { icon: <Zap className="w-3.5 h-3.5" />,   text: 'Real-time analysis' },
                    { icon: <Download className="w-3.5 h-3.5" />, text: 'CSV export' },
                  ].map(f => (
                    <div key={f.text} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-xs text-slate-400">
                      <span className="text-slate-500">{f.icon}</span>{f.text}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ─── Dashboard View ─── */}
            {activeTab === 'dashboard' && results && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, filter: 'blur(8px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.35 }}
                className="max-w-[1400px] mx-auto pb-24"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 mt-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h1 className="text-3xl lg:text-4xl font-extrabold gradient-emerald">AI Analysis Report</h1>
                      {isDemoMode && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-300 text-xs font-bold">
                          <Sparkles className="w-3 h-3" /> Synthetic Demo
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 text-sm mt-1">
                      {isDemoMode ? 'FMCG synthetic dataset · XAI-enhanced analysis' : 'Intelligent audit'} · {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      id="btn-export-csv"
                      onClick={() => exportToCSV(results)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <button
                      id="btn-new-analysis"
                      onClick={handleReset}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" /> New Analysis
                    </button>
                  </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <MetricCard
                    title="Total Discrepancies"
                    value={mismatchCount}
                    icon={<AlertTriangle className="w-4 h-4 text-orange-400" />}
                    sub={`${filtered.length} shown after filter`}
                    variant="warning"
                  />
                  <MetricCard
                    title="High Severity"
                    value={highSevCount}
                    icon={<XCircle className="w-4 h-4 text-red-400" />}
                    sub={`${Math.round(highSevCount / Math.max(mismatchCount, 1) * 100)}% of total`}
                    variant="danger"
                  />
                  <MetricCard
                    title="Value at Risk"
                    value={`₹${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    icon={<DollarSign className="w-4 h-4 text-cyan-400" />}
                    sub="total discrepancy amount"
                  />
                  <MetricCard
                    title="Avg. Confidence"
                    value={`${avgXAIConfidence}%`}
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                    sub="AI analysis certainty"
                    variant="success"
                  />
                </div>

                {/* ── XAI Summary Panel (demo only) ── */}
                {isDemoMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel p-6 mb-8 relative overflow-hidden"
                  >
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-500 rounded-full blur-3xl opacity-10 pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-fuchsia-500 rounded-full blur-3xl opacity-10 pointer-events-none" />
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                        <Brain className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-white text-sm">XAI Engine — Global Insights</h3>
                        <p className="text-xs text-slate-500">Explainable AI meta-analysis across all 8 discrepancies</p>
                      </div>
                      <span className="ml-auto text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded-full font-bold uppercase tracking-wide">Live XAI</span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4">
                      {[
                        {
                          title: 'Top Risk Factor',
                          value: 'Zero Customer Record',
                          sub: 'Present in 37.5% of cases',
                          icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
                          color: 'red'
                        },
                        {
                          title: 'Most Common Cause',
                          value: 'Pricing Sync Failure',
                          sub: 'ERP ↔ CRM discount mismatch',
                          icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
                          color: 'amber'
                        },
                        {
                          title: 'XAI Coverage',
                          value: '8 / 8 cases',
                          sub: 'Full factor attribution available',
                          icon: <Shield className="w-4 h-4 text-emerald-400" />,
                          color: 'emerald'
                        }
                      ].map(item => (
                        <div key={item.title} className="glass-panel-sm p-4">
                          <div className="flex items-center gap-2 mb-2">
                            {item.icon}
                            <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest">{item.title}</p>
                          </div>
                          <p className="font-black text-white text-base leading-tight mb-1">{item.value}</p>
                          <p className="text-xs text-slate-500">{item.sub}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Charts row */}
                <div className="grid lg:grid-cols-5 gap-5 mb-8">
                  {/* Donut chart */}
                  <div className="glass-panel p-5 col-span-2 flex flex-col">
                    <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4">Severity Breakdown</h3>
                    <div className="flex-1 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={85} paddingAngle={4} strokeWidth={0}>
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS] ?? '#888'} />
                            ))}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-5 mt-2">
                      {pieData.map(d => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[d.name as keyof typeof SEVERITY_COLORS] }} />
                          <span className="text-slate-400">{d.name}</span>
                          <span className="font-bold text-white">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bar chart — value comparison */}
                  <div className="glass-panel p-5 col-span-3 flex flex-col">
                    <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4">Invoice Value Comparison</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={barData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="id" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                        <Bar dataKey="Company"  fill="#818cf8" radius={[4,4,0,0]} />
                        <Bar dataKey="Customer" fill="#f472b6" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Issue type + Radar charts row (demo only) */}
                {isDemoMode && (
                  <div className="grid lg:grid-cols-2 gap-5 mb-8">
                    {/* Issue type donut */}
                    <div className="glass-panel p-5 flex flex-col">
                      <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4 flex items-center gap-2">
                        <Brain className="w-3.5 h-3.5 text-violet-400" /> Issue Type Distribution
                      </h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={issueTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={3} strokeWidth={0}>
                            {issueTypeData.map((entry, i) => (
                              <Cell key={i} fill={ISSUE_TYPE_COLORS[entry.name] ?? '#888'} />
                            ))}
                          </Pie>
                          <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                        {issueTypeData.map(d => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ISSUE_TYPE_COLORS[d.name] ?? '#888' }} />
                            <span className="text-slate-500">{d.name}</span>
                            <span className="font-bold text-white">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Radar chart */}
                    <div className="glass-panel p-5 flex flex-col">
                      <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4 flex items-center gap-2">
                        <Eye className="w-3.5 h-3.5 text-fuchsia-400" /> Discrepancy Spread (Radar)
                      </h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.08)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                          <PolarRadiusAxis tick={false} axisLine={false} />
                          <Radar name="Count" dataKey="value" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.25} strokeWidth={2} />
                          <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '12px' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Critical items */}
                {highSevCount > 0 && (
                  <div className="glass-panel p-5 mb-8">
                    <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Critical Action Items
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {results.filter(r => r.severity === 'High').slice(0, 6).map((r, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedInvoice(r)}
                          className="text-left bg-red-500/8 border border-red-500/20 rounded-xl p-4 hover:border-red-500/40 hover:bg-red-500/12 transition-all group"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-red-300 font-mono text-sm">#{r.invoice_id}</span>
                            <div className="flex items-center gap-1">
                              {r.financial_impact && (
                                <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-bold">
                                  ₹{r.financial_impact.toLocaleString()}
                                </span>
                              )}
                              <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                                {Math.round(Number(r.confidence) * 100)}%
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">{r.reason}</p>
                          <p className="text-xs text-red-400/70 mt-2 flex items-center gap-1 group-hover:text-red-300 transition-colors">
                            <Brain className="w-3 h-3" /> View XAI analysis
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Results table */}
                <div className="glass-panel overflow-hidden">
                  {/* Table toolbar */}
                  <div className="p-4 border-b border-white/[0.05] flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-300 tracking-wide flex items-center gap-2">
                      All Discrepancies
                      {isDemoMode && <span className="text-xs text-fuchsia-400 font-normal">(click any row for XAI →)</span>}
                    </h3>
                    <div className="flex gap-3 w-full sm:w-auto">
                      {/* Search */}
                      <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input
                          id="input-search-invoices"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search invoices…"
                          className="input-field pl-8 text-sm w-full sm:w-48"
                        />
                      </div>
                      {/* Severity filter */}
                      <div className="flex gap-1">
                        {(['All', 'High', 'Medium', 'Low'] as const).map(sev => (
                          <button
                            key={sev}
                            id={`btn-filter-${sev.toLowerCase()}`}
                            onClick={() => setSeverityFilter(sev)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                              severityFilter === sev
                                ? 'bg-violet-600/30 text-violet-300 border border-violet-500/30'
                                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                            )}
                          >{sev}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-900/40 text-slate-500 text-xs tracking-widest uppercase border-b border-white/[0.05]">
                          <th className="p-4 font-semibold">Invoice ID</th>
                          <th className="p-4 font-semibold">Issue Type</th>
                          <th className="p-4 font-semibold">Severity</th>
                          <th className="p-4 font-semibold">₹ Impact</th>
                          <th className="p-4 font-semibold">Confidence</th>
                          {isDemoMode && <th className="p-4 font-semibold">Priority</th>}
                          <th className="p-4 font-semibold">AI Reasoning</th>
                          <th className="p-4 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-600">
                              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              No results match your filter.
                            </td>
                          </tr>
                        )}
                        {filtered.map((row, idx) => {
                          const impact = row.financial_impact ?? Math.abs(row.company_qty * row.company_price - row.customer_qty * row.customer_price);
                          const confidence = Math.round(Number(row.confidence) * 100);
                          return (
                            <motion.tr
                              key={idx}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                              onClick={() => setSelectedInvoice(row)}
                              className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer group"
                            >
                              <td className="p-4 font-mono font-bold text-sm text-slate-200">#{row.invoice_id}</td>
                              <td className="p-4">
                                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/15 whitespace-nowrap">
                                  {row.issue_type}
                                </span>
                              </td>
                              <td className="p-4">
                                <span className={cn(
                                  'px-2.5 py-1 rounded-full text-xs font-bold border',
                                  row.severity === 'High'   ? 'badge-high' :
                                  row.severity === 'Medium' ? 'badge-medium' : 'badge-low'
                                )}>
                                  {row.severity}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-sm font-bold text-slate-200">
                                ₹{impact.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${confidence}%`,
                                        background: confidence >= 80 ? '#10b981' : confidence >= 65 ? '#f59e0b' : '#ef4444'
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">{confidence}%</span>
                                </div>
                              </td>
                              {isDemoMode && (
                                <td className="p-4">
                                  <span className="text-xs font-bold text-indigo-400">
                                    {row.resolution_priority ? `P${row.resolution_priority}` : '–'}
                                  </span>
                                </td>
                              )}
                              <td className="p-4 max-w-xs">
                                <p className="text-sm text-slate-400 truncate group-hover:text-slate-200 transition-colors">{row.explanation}</p>
                              </td>
                              <td className="p-4">
                                {isDemoMode ? (
                                  <div className="flex items-center gap-1 text-violet-500 group-hover:text-violet-300 transition-colors">
                                    <Brain className="w-3.5 h-3.5" />
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-fuchsia-400 transition-colors" />
                                )}
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-4 py-3 border-t border-white/[0.05] flex justify-between items-center">
                    <p className="text-xs text-slate-600">
                      Showing <span className="text-slate-400 font-medium">{filtered.length}</span> of <span className="text-slate-400 font-medium">{mismatchCount}</span> records
                    </p>
                    {results.length > 0 && (
                      <button onClick={() => exportToCSV(results)} className="text-xs text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 transition-colors">
                        <Download className="w-3 h-3" /> Export all
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
