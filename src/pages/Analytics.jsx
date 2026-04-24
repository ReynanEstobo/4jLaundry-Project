import { addDays, format, subDays } from "date-fns";
import {
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Percent,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
];

// ─── Simple linear regression for prediction ──────────────────────────────────
function linearRegression(points) {
  const n = points.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ─── Custom tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        fontSize: 13,
        color: "#111827",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            color: p.color,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color,
              display: "inline-block",
            }}
          />
          <span style={{ color: "#6b7280", textTransform: "capitalize" }}>
            {p.name}:
          </span>
          <span style={{ fontWeight: 600 }}>
            {p.name === "predicted"
              ? p.value?.toFixed(0)
              : `₱${Number(p.value).toLocaleString()}`}
          </span>
          {p.payload?.isPrediction && (
            <span
              style={{
                fontSize: 10,
                background: "#f0fdf4",
                color: "#10b981",
                borderRadius: 4,
                padding: "1px 5px",
                fontWeight: 600,
              }}
            >
              FORECAST
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Sub-filter pill group ─────────────────────────────────────────────────────
function SubFilter({ value, onChange, options }) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "#f3f4f6",
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "5px 14px",
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            transition: "all 0.15s ease",
            background: value === opt.value ? "#fff" : "transparent",
            color: value === opt.value ? "#111827" : "#6b7280",
            boxShadow:
              value === opt.value ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState("weekly");
  const [customRange, setCustomRange] = useState({
    start: null,
    end: null,
  });
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [forecastOrders, setForecastOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({});

  // Sub-filters for each chart
  // daily | weekly | monthly
  const [predRange, setPredRange] = useState("week"); // week | month | year

  useEffect(() => {
    loadAnalytics();
  }, [range, customRange]);

  const loadAnalyticsCb = useCallback(
    () => loadAnalytics(),
    [range, customRange],
  );
  useRealtime(["orders", "expenses"], loadAnalyticsCb);

  async function loadAnalytics() {
    setLoading(true);
    const now = new Date();

    let startDate;
    let endDate = new Date().toISOString();

    // ✅ PRIORITY: custom range
    if (customRange.start && customRange.end) {
      startDate = new Date(customRange.start).toISOString();
      endDate = new Date(customRange.end).toISOString();
    } else {
      if (range === "weekly") {
        startDate = subDays(now, 7).toISOString();
      } else if (range === "monthly") {
        // 🔥 FULL YEAR (IMPORTANT)
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
      } else {
        // 🔥 MULTIPLE YEARS
        startDate = new Date(now.getFullYear() - 5, 0, 1).toISOString();
      }
    }

    const [ordersRes, expensesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*, service_types(name)")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: true }),

      supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", format(new Date(startDate), "yyyy-MM-dd"))
        .lte("expense_date", format(new Date(endDate), "yyyy-MM-dd")),
    ]);

    const orderData = ordersRes.data || [];

    const expenseData = expensesRes.data || [];
    setOrders(orderData);
    setExpenses(expenseData);

    // 🔥 NEW: fetch ALL orders for forecasting (independent)
    const { data: forecastData } = await supabase
      .from("orders")
      .select("created_at")
      .order("created_at", { ascending: true });

    setForecastOrders(forecastData || []);

    const totalRevenue = orderData
      .filter((o) => o.payment_status === "paid")
      .reduce((s, o) => s + Number(o.total_price), 0);
    const totalExpenses = expenseData.reduce((s, e) => s + Number(e.amount), 0);
    const profit = totalRevenue - totalExpenses;
    const avgOrderValue =
      orderData.length > 0 ? totalRevenue / orderData.length : 0;

    let prevStart;

    if (range === "weekly") {
      prevStart = subDays(now, 14).toISOString();
    } else if (range === "monthly") {
      prevStart = subDays(now, 60).toISOString();
    } else {
      prevStart = subDays(now, 730).toISOString();
    }
    const prevOrders = orderData.filter(
      (o) =>
        o.created_at >= prevStart &&
        o.created_at < startDate &&
        o.payment_status === "paid",
    );
    const prevRevenue = prevOrders.reduce(
      (s, o) => s + Number(o.total_price),
      0,
    );
    const revenueChange =
      prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    setStats({
      totalRevenue,
      totalExpenses,
      profit,
      avgOrderValue,
      totalOrders: orderData.length,
      revenueChange: revenueChange.toFixed(1),
    });
    setLoading(false);
  }

  // ── Descriptive: Revenue & Expenses grouped ────────────────────────────────
  // ── Descriptive: Revenue & Expenses grouped ────────────────────────────────
  function getDescriptiveData() {
    if (!orders.length && !expenses.length) return [];

    // ✅ Determine active range
    let start, end;

    if (customRange.start && customRange.end) {
      // ✅ CUSTOM RANGE
      start = new Date(customRange.start);
      end = new Date(customRange.end);
    } else {
      // ✅ TRUE DEFAULT BEHAVIOR
      const now = new Date();

      if (range === "weekly") {
        start = subDays(now, 7);
        end = now;
      } else if (range === "monthly") {
        // 🔥 FIX: FULL YEAR
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
      } else {
        start = new Date(now.getFullYear() - 5, 0, 1); // 🔥 last 6 years
        end = new Date(now.getFullYear(), 11, 31);
      }
    }

    const result = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      let key;
      let label;

      if (customRange.start && customRange.end) {
        // 🔥 CUSTOM RANGE MODE
        if (range === "weekly") {
          label = format(cursor, "EEE");
        } else if (range === "monthly") {
          label = format(cursor, "MMM yyyy");
        } else {
          label = format(cursor, "yyyy");
        }
      } else {
        // DEFAULT MODE
        if (range === "weekly") {
          label = format(cursor, "EEE"); // keep
        } else if (range === "monthly") {
          label = format(cursor, "MMM"); // keep
        } else {
          label = format(cursor, "yyyy");
        }
      }

      key = label;

      let uniqueKey;

      if (range === "weekly") {
        uniqueKey = format(cursor, "yyyy-MM-dd");
      } else if (range === "monthly") {
        uniqueKey = format(cursor, "yyyy-MM"); // 🔥 IMPORTANT
      } else {
        uniqueKey = format(cursor, "yyyy");
      }

      if (!result.find((r) => r.key === uniqueKey)) {
        result.push({
          key: uniqueKey,
          date: label,
          revenue: 0,
          expenses: 0,
          _date: new Date(cursor),
        });
      }

      // ⏩ Move cursor
      if (range === "weekly") {
        cursor.setDate(cursor.getDate() + 1);
      } else if (range === "monthly") {
        cursor.setMonth(cursor.getMonth() + 1);
      } else {
        cursor.setFullYear(cursor.getFullYear() + 1);
      }
    }

    // ✅ MAP ORDERS
    orders.forEach((o) => {
      if (o.payment_status !== "paid") return;

      const d = new Date(o.created_at);

      let key;

      if (range === "weekly") {
        key = format(d, "yyyy-MM-dd");
      } else if (range === "monthly") {
        key = format(d, "yyyy-MM");
      } else {
        key = format(d, "yyyy");
      }

      const item = result.find((r) => r.key.startsWith(key));
      if (item) item.revenue += Number(o.total_price);
    });

    // ✅ MAP EXPENSES
    expenses.forEach((e) => {
      const d = new Date(e.expense_date);

      let key;

      if (range === "weekly") {
        key = format(d, "yyyy-MM-dd");
      } else if (range === "monthly") {
        key = format(d, "yyyy-MM"); // 🔥 SAME AS ORDERS
      } else {
        key = format(d, "yyyy");
      }

      const item = result.find((r) => r.key.startsWith(key));
      if (item) item.expenses += Number(e.amount);
    });

    result.sort((a, b) => a._date - b._date);

    return result;
  }

  // ── Predictive: orders forecast ────────────────────────────────────────────
  function getPredictiveData() {
    if (!forecastOrders.length) return [];

    const dailyMap = {};

    forecastOrders.forEach((o) => {
      const d = format(new Date(o.created_at), "yyyy-MM-dd");
      dailyMap[d] = (dailyMap[d] || 0) + 1;
    });

    const sortedDays = Object.keys(dailyMap).sort();
    let recentDays;

    if (predRange === "week") {
      recentDays = sortedDays.slice(-14);
    } else if (predRange === "month") {
      recentDays = sortedDays.slice(-30);
    } else {
      recentDays = sortedDays.slice(-90);
    }

    const points = recentDays.map((d, i) => ({
      x: i,
      y: dailyMap[d],
    }));

    const { slope, intercept } = linearRegression(points);

    const avg =
      recentDays.length > 0
        ? recentDays.reduce((s, d) => s + dailyMap[d], 0) / recentDays.length
        : 0;

    let futureDates = [];
    const today = new Date();

    if (predRange === "week") {
      futureDates = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
    } else if (predRange === "month") {
      futureDates = Array.from({ length: 30 }, (_, i) => addDays(today, i + 1));
    } else {
      // yearly → next 12 months
      futureDates = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() + i + 1);
        return d;
      });
    }

    // 🔥 BUILD HISTORICAL CONTEXT FOR ALL MODES
    let histSlice = [];

    // 🔥 PREDICTIONS
    const predicted = futureDates.map((date, i) => {
      const trend = slope * (recentDays.length + i) + intercept;

      let raw = trend * 0.7 + avg * 0.3;

      raw = Math.max(0, Math.min(raw, avg * 2));

      return {
        date:
          predRange === "year"
            ? format(date, "MMM yyyy")
            : predRange === "month"
              ? format(date, "MMM d")
              : format(date, "EEE"),
        predicted: isNaN(raw) ? 0 : Math.round(raw),
        isPrediction: true,
      };
    });

    return predicted;
  }

  const descriptiveData = getDescriptiveData();
  const predictiveData = getPredictiveData();
  const splitIndex = predictiveData.findIndex((d) => d.isPrediction);
  const splitDate = splitIndex >= 0 ? predictiveData[splitIndex].date : null;

  const predSubOptions = [
    { value: "week", label: "Next Week" },
    { value: "month", label: "Next Month" },
    { value: "year", label: "Next Year" },
  ];

  return (
    <>
      {/* Period selector */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* 📅 DATE RANGE FILTER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "8px 12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
        >
          {/* ICON LABEL */}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
            {customRange.start && customRange.end
              ? `${format(new Date(customRange.start), "MMM d")} → ${format(new Date(customRange.end), "MMM d")}`
              : "📅 Date Range"}
          </span>

          {/* START DATE */}
          <input
            type="date"
            value={customRange.start || ""}
            onChange={(e) =>
              setCustomRange((prev) => ({ ...prev, start: e.target.value }))
            }
            style={{
              border: "none",
              outline: "none",
              fontSize: 13,
              background: "transparent",
              color: "#111827",
              fontWeight: 500,
            }}
          />

          <span style={{ color: "#9ca3af" }}>→</span>

          {/* END DATE */}
          <input
            type="date"
            value={customRange.end || ""}
            onChange={(e) =>
              setCustomRange((prev) => ({ ...prev, end: e.target.value }))
            }
            style={{
              border: "none",
              outline: "none",
              fontSize: 13,
              background: "transparent",
              color: "#111827",
              fontWeight: 500,
            }}
          />

          {/* CLEAR BUTTON */}
          {(customRange.start || customRange.end) && (
            <button
              onClick={() => setCustomRange({ start: null, end: null })}
              style={{
                marginLeft: 6,
                border: "none",
                background: "#fee2e2",
                color: "#ef4444",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          opacity: loading ? 0.5 : 1,
          pointerEvents: loading ? "none" : "auto",
          transition: "opacity 0.2s",
        }}
      >
        {/* Stat Cards */}
        <div className="stats-grid">
          <div className="stat-card green">
            <div className="stat-icon">
              <DollarSign size={22} />
            </div>
            <div className="stat-value">
              ₱{stats.totalRevenue?.toLocaleString()}
            </div>
            <div className="stat-label">Total Revenue</div>
            <div
              className={`stat-change ${Number(stats.revenueChange) >= 0 ? "up" : "down"}`}
            >
              {Number(stats.revenueChange) >= 0 ? (
                <>
                  <ArrowUpRight size={14} /> +{stats.revenueChange}%
                </>
              ) : (
                <>
                  <ArrowDownRight size={14} /> {stats.revenueChange}%
                </>
              )}{" "}
              vs previous period
            </div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">
              <TrendingUp size={22} />
            </div>
            <div className="stat-value">
              ₱{stats.totalExpenses?.toLocaleString()}
            </div>
            <div className="stat-label">Total Expenses</div>
          </div>
          <div className="stat-card cyan">
            <div className="stat-icon">
              <Percent size={22} />
            </div>
            <div
              className="stat-value"
              style={{
                color: stats.profit >= 0 ? "var(--success)" : "var(--danger)",
              }}
            >
              ₱{stats.profit?.toLocaleString()}
            </div>
            <div className="stat-label">Net Profit</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon">
              <ShoppingBag size={22} />
            </div>
            <div className="stat-value">{stats.totalOrders}</div>
            <div className="stat-label">Total Orders</div>
            <div className="stat-change" style={{ color: "var(--text-muted)" }}>
              Avg: ₱{stats.avgOrderValue?.toFixed(0)}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="charts-grid">
          {/* Descriptive: Revenue & Expenses */}
          <div className="card">
            <div
              className="card-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Revenue & Expenses</h3>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Descriptive ·{" "}
                  {customRange.start && customRange.end
                    ? `${format(new Date(customRange.start), "MMM d")} - ${format(new Date(customRange.end), "MMM d, yyyy")}`
                    : `${range.charAt(0).toUpperCase() + range.slice(1)}`}{" "}
                  breakdown
                </p>
              </div>
              <SubFilter
                value={customRange.start && customRange.end ? null : range}
                onChange={(val) => {
                  // 🔥 HARD RESET ORDER (IMPORTANT)
                  setCustomRange({ start: null, end: null });

                  setTimeout(() => {
                    setRange(val);
                  }, 0);
                }}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly", label: "Yearly" },
                ]}
              />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={descriptiveData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f3f4f6"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  fill="url(#revGrad)"
                  strokeWidth={2}
                  dot={false}
                />

                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  fill="url(#expGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Predictive: Order Forecast */}
          <div className="card">
            <div
              className="card-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  Order Forecast
                 
                </h3>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  Predictive · Linear trend · Historical + forecast
                </p>
              </div>
              <SubFilter
                value={predRange}
                onChange={setPredRange}
                options={predSubOptions}
              />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={predictiveData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f3f4f6"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={
                    predRange === "year" ? 4 : predRange === "month" ? 3 : 0
                  }
                />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />

                <Bar
                  dataKey="predicted"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  opacity={0.9}
                  fill="url(#predGrad)"
                >
                  {predictiveData.map((_, i) => null)}
                </Bar>
                <defs>
                  <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <Legend formatter={() => "Predicted Workload"} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
