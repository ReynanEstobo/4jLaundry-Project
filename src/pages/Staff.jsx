import { format } from "date-fns";
import { Edit2, Eye, EyeOff, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { useRealtime } from "../lib/useRealtime";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];

export default function Staff() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    role: "staff",
    position: "",
    password: "",
  });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: false });
    setStaffList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  // Realtime: refresh when staff changes
  useRealtime(["staff"], loadStaff);

  function openNew() {
    setEditing(null);
    setForm({
      full_name: "",
      phone: "",
      email: "",
      role: "staff",
      position: "",
      password: "",
    });
    setShowPassword(false);
    setShowModal(true);
  }

  function openEdit(staff) {
    setEditing(staff);
    setForm({
      full_name: staff.full_name,
      phone: staff.phone || "",
      email: staff.email || "",
      role: staff.role || "staff",
      position: staff.position || "",
      password: "",
    });
    setShowPassword(false);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.email.trim()) return toast.error("Email is required");

    setSaving(true);

    if (editing) {
      // Update staff record
      const updates = {
        full_name: form.full_name,
        phone: form.phone,
        email: form.email,
        role: form.role,
        position: form.position,
      };
      const { error } = await supabase
        .from("staff")
        .update(updates)
        .eq("id", editing.id);
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }

      // If password changed, update auth user
      if (form.password && form.password.length >= 6 && editing.auth_id) {
        const { error: pwErr } = await supabase.functions.invoke(
          "update-staff-password",
          {
            body: { user_id: editing.auth_id, password: form.password },
          },
        );
        if (pwErr)
          toast.error(
            "Staff updated but password change failed — use Supabase dashboard",
          );
      }

      toast.success("Staff updated!");
    } else {
      // Create new — first create auth user, then staff record
      if (!form.password || form.password.length < 6) {
        setSaving(false);
        return toast.error("Password must be at least 6 characters");
      }

      // Create auth user via Supabase signUp (will need confirmation disabled or admin API)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.full_name, role: form.role },
        },
      });

      if (authError) {
        setSaving(false);
        return toast.error(authError.message);
      }

      // Insert staff record
      const { error } = await supabase.from("staff").insert({
        auth_id: authData.user?.id || null,
        full_name: form.full_name,
        phone: form.phone,
        email: form.email,
        role: form.role,
        position: form.position,
      });

      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      toast.success("Staff account created!");
    }

    setSaving(false);
    setShowModal(false);
    loadStaff();
  }

  async function deleteStaff(staff) {
    if (!confirm(`Delete ${staff.full_name}? This cannot be undone.`)) return;
    const { error } = await supabase.from("staff").delete().eq("id", staff.id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
    loadStaff();
  }

  const filtered = staffList.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q)
    );
  });

  if (loading)
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="search-box">
          <Search />
          <input
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={18} /> Add Staff
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Position</th>
                <th>Role</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    <p>No staff found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td
                      style={{ fontWeight: 600, color: "var(--text-primary)" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background:
                              s.role === "admin"
                                ? "var(--primary)"
                                : "var(--primary-light)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 13,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {s.full_name.charAt(0).toUpperCase()}
                        </div>
                        {s.full_name}
                      </div>
                    </td>
                    <td>{s.email || "—"}</td>
                    <td>{s.phone || "—"}</td>
                    <td>{s.position || "—"}</td>
                    <td>
                      <span
                        className={`badge ${s.role === "admin" ? "badge-paid" : "badge-partial"}`}
                        style={{ textTransform: "capitalize" }}
                      >
                        {s.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      {s.created_at
                        ? format(new Date(s.created_at), "MMM d, yyyy")
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn-icon"
                          onClick={() => openEdit(s)}
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => deleteStaff(s)}
                          title="Delete"
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? "Edit Staff" : "Add Staff"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      className="form-control"
                      placeholder="Juan Dela Cruz"
                      value={form.full_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, full_name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      className="form-control"
                      placeholder="09171234567"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>
                    Email *{" "}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      (used for login)
                    </span>
                  </label>
                  <input
                    className="form-control"
                    type="email"
                    placeholder="staff@4jlaundry.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    required
                    disabled={!!editing}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Position</label>
                    <input
                      className="form-control"
                      placeholder="e.g. Cashier, Washer"
                      value={form.position}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, position: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      className="form-control"
                      value={form.role}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, role: e.target.value }))
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>
                    {editing ? "New Password" : "Password *"}{" "}
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {editing
                        ? "(leave blank to keep current)"
                        : "(min 6 characters)"}
                    </span>
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="form-control"
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        editing ? "Leave blank to keep" : "Min. 6 characters"
                      }
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      {...(!editing && { required: true, minLength: 6 })}
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        padding: 4,
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Update Staff"
                      : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
