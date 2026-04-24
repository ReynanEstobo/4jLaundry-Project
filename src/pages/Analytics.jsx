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
  }, [range]);

  const loadAnalyticsCb = useCallback(() => loadAnalytics(), [range]);
  useRealtime(["orders", "expenses"], loadAnalyticsCb);

  async function loadAnalytics() {
    setLoading(true);
    const now = new Date();

    let startDate;
    if (range === "weekly") {
      startDate = subDays(now, 7).toISOString();
    } else if (range === "monthly") {
      startDate = subDays(now, 30).toISOString();
    } else {
      startDate = subDays(now, 365).toISOString();
    }

    const [ordersRes, expensesRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*, service_types(name)")
        .gte("created_at", startDate)
        .order("created_at", { ascending: true }),
      supabase
        .from("expenses")
        .select("*")
        .gte("expense_date", format(new Date(startDate), "yyyy-MM-dd")),
      supabase
        .from("orders")
        .select("total_price, payment_status, created_at")
        .order("created_at", { ascending: true }),
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
    // ✅ YOUR NEW CODE HERE
    let base = [];

    if (range === "weekly") {
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

      base = labels.map((label, i) => {
        const dayIndex = i + 1; // Monday = 1

        const dayOrders = orders.filter((o) => {
          const d = new Date(o.created_at);
          return d.getDay() === dayIndex && o.payment_status === "paid";
        });

        const dayExpenses = expenses.filter((e) => {
          const d = new Date(e.expense_date);
          return d.getDay() === dayIndex;
        });

        return {
          date: label,
          revenue: dayOrders.reduce((s, o) => s + Number(o.total_price), 0),
          expenses: dayExpenses.reduce((s, e) => s + Number(e.amount), 0),
        };
      });
    }

    // 🔵 MONTHLY → January to December
    if (range === "monthly") {
      const months = Array.from({ length: 12 }, (_, i) => i);

      base = months.map((month) => {
        const monthOrders = orders.filter((o) => {
          const d = new Date(o.created_at);
          return d.getMonth() === month && o.payment_status === "paid";
        });

        const monthExpenses = expenses.filter((e) => {
          const d = new Date(e.expense_date);
          return d.getMonth() === month;
        });

        return {
          date: format(new Date(2024, month), "MMM"),
          revenue: monthOrders.reduce((s, o) => s + Number(o.total_price), 0),
          expenses: monthExpenses.reduce((s, e) => s + Number(e.amount), 0),
        };
      });
    }

    // 🟣 YEARLY → LAST 5 YEARS ONLY
    if (range === "yearly") {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);

      base = years.map((year) => {
        const yearOrders = orders.filter((o) => {
          const d = new Date(o.created_at);
          return d.getFullYear() === year && o.payment_status === "paid";
        });

        const yearExpenses = expenses.filter((e) => {
          const d = new Date(e.expense_date);
          return d.getFullYear() === year;
        });

        return {
          date: year.toString(),
          revenue: yearOrders.reduce((s, o) => s + Number(o.total_price), 0),
          expenses: yearExpenses.reduce((s, e) => s + Number(e.amount), 0),
        };
      });
    }
    return base;
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
    const recentDays =
      predRange === "year" ? sortedDays.slice(-90) : sortedDays.slice(-30);

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
          marginBottom: 24,
        }}
      ></div>

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
                  Descriptive · {range.charAt(0).toUpperCase() + range.slice(1)}{" "}
                  breakdown
                </p>
              </div>
              <SubFilter
                value={range}
                onChange={setRange}
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
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                      borderRadius: 6,
                      padding: "2px 7px",
                      letterSpacing: "0.05em",
                    }}
                  >
                    AI
                  </span>
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
