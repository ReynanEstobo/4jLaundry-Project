import { format } from "date-fns";
import { CheckCircle, Clock, Search, Send, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";

// SMS Templates
const TEMPLATES = [
  {
    id: "ready",
    label: "Ready for Pickup",
    message:
      "Hi {name}! Your laundry (Order #{order}) is ready for pickup at 4J Laundry. Thank you!",
  },
  {
    id: "received",
    label: "Order Received",
    message:
      "Hi {name}! We received your laundry (Order #{order}). Estimated completion: {time}. Thank you for choosing 4J Laundry!",
  },
  {
    id: "reminder",
    label: "Pickup Reminder",
    message:
      "Hi {name}! Friendly reminder: Your laundry (Order #{order}) is still waiting for pickup at 4J Laundry. Please pick up at your earliest convenience.",
  },
  {
    id: "promo",
    label: "Promotion",
    message:
      "Hi {name}! 4J Laundry has a special promo this week! Avail 20% off on all services. Visit us today!",
  },
];

export default function SMS() {
  const [logs, setLogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState("email");
  const [search, setSearch] = useState("");
  const [emailSending, setEmailSending] = useState({});

  const [form, setForm] = useState({
    order_id: "",
    phone: "",
    message: "",
    template: "",
  });

  const [emailForm, setEmailForm] = useState({
    to: "",
    subject: "",
    body: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);

    const [logsRes, ordersRes] = await Promise.all([
      supabase
        .from("sms_log")
        .select("*, orders(order_number), customers(name)")
        .order("sent_at", { ascending: false })
        .limit(100),

      supabase
        .from("orders")
        .select("*, customers(name, phone, email)")
        .in("status", ["washing", "drying", "folding", "ready"])
        .order("created_at", { ascending: false }),
    ]);

    setLogs(logsRes.data || []);
    setOrders(ordersRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useRealtime(["sms_log", "orders"], loadData);

  function selectOrder(orderId) {
    const order = orders.find((o) => o.id === orderId);

    if (order) {
      setForm((f) => ({
        ...f,
        order_id: orderId,
        phone: order.customers?.phone || "",
      }));
    }
  }

  function applyTemplate(templateId) {
    const tpl = TEMPLATES.find((t) => t.id === templateId);

    if (!tpl) return;

    const order = orders.find((o) => o.id === form.order_id);

    let msg = tpl.message
      .replace("{name}", order?.customers?.name || "Customer")
      .replace("{order}", order?.order_number || "—")
      .replace(
        "{time}",
        order?.estimated_completion
          ? format(new Date(order.estimated_completion), "MMM d, h:mm a")
          : "—",
      );

    setForm((f) => ({
      ...f,
      template: templateId,
      message: msg,
    }));
  }

  async function handleSend(e) {
    e.preventDefault();

    if (!form.phone || !form.message) {
      return toast.error("Phone and message are required");
    }

    setSending(true);

    let smsStatus = "failed";

    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: form.phone,
          message: form.message,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        smsStatus = "sent";
        toast.success("SMS sent successfully!");
      } else {
        toast.error(data.error || "Failed to send SMS");
      }
    } catch {
      toast.error("Failed to send SMS — check network");
    }

    await supabase.from("sms_log").insert({
      order_id: form.order_id || null,
      customer_id:
        orders.find((o) => o.id === form.order_id)?.customer_id || null,
      phone: form.phone,
      message: form.message,
      status: smsStatus,
    });

    if (smsStatus === "sent") {
      setForm({
        order_id: "",
        phone: "",
        message: "",
        template: "",
      });
    }

    loadData();
    setSending(false);
  }

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <>
      <div
        className="tabs"
        style={{ display: "inline-flex", marginBottom: 20 }}
      >
        <button
          className={`tab ${tab === "send" ? "active" : ""}`}
          onClick={() => setTab("send")}
        >
          Send SMS
        </button>

        <button
          className={`tab ${tab === "logs" ? "active" : ""}`}
          onClick={() => setTab("logs")}
        >
          SMS Log
        </button>
      </div>

      {tab === "send" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
            maxWidth: 900,
          }}
        >
          <div className="card">
            <div className="card-header">
              <h3>Compose SMS</h3>
            </div>

            <form onSubmit={handleSend}>
              <div className="form-group">
                <label>Linked Order (optional)</label>

                <select
                  className="form-control"
                  value={form.order_id}
                  onChange={(e) => {
                    setForm((f) => ({
                      ...f,
                      order_id: e.target.value,
                    }));

                    selectOrder(e.target.value);
                  }}
                >
                  <option value="">No linked order</option>

                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} - {o.customers?.name || "Walk-in"} (
                      {o.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Phone Number *</label>

                <input
                  className="form-control"
                  placeholder="09171234567"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      phone: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Template</label>

                <select
                  className="form-control"
                  value={form.template}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Custom message</option>

                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>
                  Message *{" "}
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontWeight: 400,
                    }}
                  >
                    ({form.message.length}/160)
                  </span>
                </label>

                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Type your message..."
                  value={form.message}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      message: e.target.value,
                    }))
                  }
                  required
                  style={{ minHeight: 120 }}
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={sending}
                style={{
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <Send size={16} />
                {sending ? " Sending..." : " Send SMS"}
              </button>
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>SMS Status</h3>
            </div>

            <div style={{ padding: "20px 0" }}>
              <div
                style={{
                  background: "#dcfce7",
                  border: "1px solid #86efac",
                  borderRadius: "var(--radius-sm)",
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 600,
                    color: "#166534",
                    marginBottom: 4,
                  }}
                >
                  <CheckCircle size={16} />
                  Semaphore SMS Active
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  SMS sending is live via Semaphore. Messages are sent
                  immediately using Semaphore's default sender name.
                </p>
              </div>

              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                }}
              >
                <p style={{ marginBottom: 8 }}>
                  <strong style={{ color: "var(--text-secondary)" }}>
                    How it works:
                  </strong>
                </p>

                <ul
                  style={{
                    paddingLeft: 20,
                    lineHeight: 1.8,
                  }}
                >
                  <li>Compose your SMS message or use a template</li>
                  <li>Messages are sent instantly via Semaphore API</li>
                  <li>Delivery status is logged automatically</li>
                  <li>Track all sent messages in the SMS Log tab</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <>
          <div style={{ marginBottom: 20 }}>
            <div className="search-box">
              <Search />

              <input
                placeholder="Search SMS logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Recipient</th>
                    <th>Phone</th>
                    <th>Order</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        <p>No SMS logs yet</p>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          {format(new Date(log.sent_at), "MMM d, h:mm a")}
                        </td>

                        <td>{log.customers?.name || "—"}</td>

                        <td>{log.phone}</td>

                        <td>{log.orders?.order_number || "—"}</td>

                        <td>{log.message}</td>

                        <td>
                          <span className={`badge badge-${log.status}`}>
                            {log.status === "sent" && <CheckCircle size={12} />}

                            {log.status === "failed" && <XCircle size={12} />}

                            {log.status === "pending" && <Clock size={12} />}

                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
