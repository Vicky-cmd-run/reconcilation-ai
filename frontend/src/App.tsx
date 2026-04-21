import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UploadCloud, FileText, CheckCircle, AlertTriangle, XCircle,
  TrendingUp, DollarSign, Activity, Download, Search,
  ChevronRight, X, BarChart2, Cpu, Shield, Zap, RefreshCw
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { reconciliationApi } from './utils/api';
import { useToast, ToastContainer, type ToastType } from './components/Toast';
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
  confidence: string;
  company_qty: number;
  customer_qty: number;
  company_price: number;
  customer_price: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SEVERITY_COLORS = { Low: '#10B981', Medium: '#F59E0B', High: '#EF4444' } as const;
const MAX_FILE_SIZE_MB = 10;

// ─── Custom Recharts Tooltip ───────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel-dark px-4 py-3 text-sm">
        <p className="text-slate-400 mb-1 font-medium">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.name === 'Company' ? '#818cf8' : '#f472b6' }}>
            {p.name}: <span className="font-bold">${p.value?.toLocaleString()}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceModal({ result, onClose }: { result: DiscrepancyResult; onClose: () => void }) {
  const companyTotal = result.company_qty * result.company_price;
  const customerTotal = result.customer_qty * result.customer_price;
  const delta = Math.abs(companyTotal - customerTotal);
  const confidence = Math.round(Number(result.confidence) * 100);

  const severityConfig = {
    High:   { ring: 'ring-red-500/40 bg-red-500/10',    text: 'text-red-400',    glow: 'shadow-red-500/20' },
    Medium: { ring: 'ring-amber-500/40 bg-amber-500/10', text: 'text-amber-400',  glow: 'shadow-amber-500/20' },
    Low:    { ring: 'ring-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
  }[result.severity];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.92, y: 20  }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className={cn(
          'glass-panel w-full max-w-2xl p-8 relative z-50 shadow-2xl',
          severityConfig.glow, 'shadow-[0_32px_80px_-8px]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs text-slate-500 font-medium tracking-widest uppercase mb-1">Invoice Detail</p>
            <h2 className="text-2xl font-extrabold text-white font-mono">#{result.invoice_id}</h2>
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border mt-2 inline-block ring-1', severityConfig.ring, severityConfig.text)}>
              {result.severity} Severity · {result.issue_type}
            </span>
          </div>
          <div className="text-center">
            <div className={cn('text-4xl font-black', severityConfig.text)}>{confidence}%</div>
            <div className="text-xs text-slate-500 mt-0.5">AI Confidence</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: 'Company Records', qty: result.company_qty, price: result.company_price, total: companyTotal, color: 'indigo' },
            { label: 'Customer Records', qty: result.customer_qty, price: result.customer_price, total: customerTotal, color: 'fuchsia' },
          ].map((side) => (
            <div key={side.label} className={`glass-panel-sm p-4 border-${side.color}-500/20`}>
              <p className={`text-xs font-bold tracking-widest uppercase text-${side.color}-400 mb-3`}>{side.label}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Quantity</span>
                  <span className="font-mono font-bold">{side.qty}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Unit Price</span>
                  <span className="font-mono font-bold">${side.price.toLocaleString()}</span>
                </div>
                <div className="border-t border-white/5 pt-2 flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className={`font-mono font-black text-${side.color}-300`}>${side.total.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Delta callout */}
        <div className={cn('rounded-xl p-4 border mb-6 flex items-center justify-between', severityConfig.ring, `border-${result.severity === 'High' ? 'red' : result.severity === 'Medium' ? 'amber' : 'emerald'}-500/20`)}>
          <span className="text-slate-400 text-sm font-medium">Value Discrepancy</span>
          <span className={cn('text-xl font-black font-mono', severityConfig.text)}>${delta.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        {/* AI Analysis */}
        <div className="space-y-4">
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
              <Shield className="w-3 h-3 text-indigo-400" /> AI Explanation
            </p>
            <p className="text-slate-300 text-sm leading-relaxed italic">{result.explanation}</p>
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

  const accentColor = color === 'indigo' ? 'indigo' : 'fuchsia';

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
      {/* Background glow orb */}
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
  const headers = ['Invoice ID', 'Issue Type', 'Severity', 'Company Qty', 'Customer Qty', 'Company Price', 'Customer Price', 'Confidence', 'Reason', 'Suggested Action'];
  const rows = results.map(r => [
    r.invoice_id, r.issue_type, r.severity,
    r.company_qty, r.customer_qty, r.company_price, r.customer_price,
    `${Math.round(Number(r.confidence) * 100)}%`,
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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscrepancyResult[] | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard'>('upload');
  const [selectedInvoice, setSelectedInvoice] = useState<DiscrepancyResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');

  const { toasts, addToast, removeToast } = useToast();

  // ── Handlers ──
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
        setActiveTab('dashboard');
        addToast(res.message || 'Analysis complete!', 'success');
        if (res.statistics?.total_mismatches > 0) {
          addToast(`${res.statistics.total_mismatches} mismatches · $${res.statistics.total_discrepancy_value?.toLocaleString()} at risk`, 'info');
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
  };

  // ── Derived metrics ──
  const mismatchCount = results?.length ?? 0;
  const highSevCount  = results?.filter(r => r.severity === 'High').length ?? 0;
  const avgConfidence = results?.length
    ? Math.round(results.reduce((s, r) => s + Number(r.confidence), 0) / results.length * 100)
    : 0;
  const totalValue = results?.reduce((acc, r) => {
    return acc + Math.abs(r.company_qty * r.company_price - r.customer_qty * r.customer_price);
  }, 0) ?? 0;

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
    id: r.invoice_id,
    Company: r.company_qty * r.company_price,
    Customer: r.customer_qty * r.customer_price,
  }));

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

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

                {/* Upload cards */}
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
                    { icon: <Cpu className="w-3.5 h-3.5" />,   text: 'Gemini-powered XAI' },
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
                    <h1 className="text-3xl lg:text-4xl font-extrabold gradient-emerald">AI Analysis Report</h1>
                    <p className="text-slate-500 text-sm mt-1">Intelligent audit · {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}</p>
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
                    value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                    icon={<DollarSign className="w-4 h-4 text-cyan-400" />}
                    sub="total discrepancy amount"
                  />
                  <MetricCard
                    title="Avg. Confidence"
                    value={`${avgConfidence}%`}
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                    sub="AI analysis certainty"
                    variant="success"
                  />
                </div>

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
                    <h3 className="text-xs text-slate-400 font-bold tracking-widest uppercase mb-4">Invoice Value Comparison (Top 10)</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={barData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="id" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                        <Bar dataKey="Company"  fill="#818cf8" radius={[4,4,0,0]} />
                        <Bar dataKey="Customer" fill="#f472b6" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

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
                            <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">
                              {Math.round(Number(r.confidence) * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">{r.reason}</p>
                          <p className="text-xs text-red-400/70 mt-2 flex items-center gap-1 group-hover:text-red-300 transition-colors">
                            <ChevronRight className="w-3 h-3" /> View detail
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
                    <h3 className="text-sm font-bold text-slate-300 tracking-wide">All Discrepancies</h3>
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
                          <th className="p-4 font-semibold">Value Δ</th>
                          <th className="p-4 font-semibold">Confidence</th>
                          <th className="p-4 font-semibold">AI Reasoning</th>
                          <th className="p-4 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-600">
                              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                              No results match your filter.
                            </td>
                          </tr>
                        )}
                        {filtered.map((row, idx) => {
                          const delta = Math.abs(row.company_qty * row.company_price - row.customer_qty * row.customer_price);
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
                                ${delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${confidence}%`,
                                        background: confidence >= 80 ? '#10b981' : confidence >= 60 ? '#f59e0b' : '#ef4444'
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">{confidence}%</span>
                                </div>
                              </td>
                              <td className="p-4 max-w-xs">
                                <p className="text-sm text-slate-400 truncate group-hover:text-slate-200 transition-colors">{row.explanation}</p>
                              </td>
                              <td className="p-4">
                                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-fuchsia-400 transition-colors" />
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
