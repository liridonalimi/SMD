import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../shared/errors";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { createAdminUser, listAdminUsers, updateAdminUser } from "../../services/usersAdmin";
import type { AdminUserListItem, AdminUserRole } from "../../types/usersAdmin";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
  cursor: "pointer",
};

type FormState = {
  username: string;
  email: string;
  password: string;
  role: AdminUserRole;
  isActive: boolean;
};

const roleOptions: Array<{ label: string; value: AdminUserRole }> = [
  { label: "Admin", value: 0 },
  { label: "Punetor", value: 1 },
  { label: "Mbikeqyres", value: 2 },
  { label: "Menaxher", value: 3 },
];

function roleFromApi(role: string): AdminUserRole {
  const v = role.toLowerCase();
  if (v === "admin") return 0;
  if (v === "supervisor") return 2;
  if (v === "manager") return 3;
  return 1;
}

function defaultForm(): FormState {
  return {
    username: "",
    email: "",
    password: "",
    role: 1,
    isActive: true,
  };
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    listAdminUsers(ac.signal)
      .then((data) => {
        setItems(data);
        if (selectedId && !data.some((x) => x.id === selectedId)) setSelectedId(null);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => x.username.toLowerCase().includes(q) || x.email.toLowerCase().includes(q));
  }, [items, query]);

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      username: selected.username,
      email: selected.email,
      password: "",
      role: roleFromApi(selected.role),
      isActive: selected.isActive,
    });
  }, [selected]);

  function resetForm() {
    setSelectedId(null);
    setForm(defaultForm());
  }

  async function refresh() {
    const data = await listAdminUsers();
    setItems(data);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password.trim() || undefined,
      role: form.role,
      isActive: form.isActive,
    };

    try {
      if (!selectedId) {
        if (!payload.password) throw new Error("Password eshte i detyrueshem per user te ri.");
        await createAdminUser(payload);
      } else {
        await updateAdminUser(selectedId, payload);
      }
      resetForm();
      await refresh();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageIntro
        title="Menaxhimi i perdoruesve"
        subtitle="Vetem admin mund te krijoje, editoje dhe aktivizoje ose caktivizoje perdoruesit."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 18 }}>
        <SurfaceCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Lista e perdoruesve</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>Zgjidh nje user per editim ose krijo te ri.</div>
            </div>
            <div style={{ minWidth: 260 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kerko sipas username ose email"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {loading ? <div>Duke u ngarkuar...</div> : null}
            {!loading && filtered.length === 0 ? <div>Nuk ka perdorues.</div> : null}
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                style={{
                  ...buttonStyle,
                  textAlign: "left",
                  background: selectedId === item.id ? "rgba(96, 165, 250, 0.12)" : "var(--panel-soft)",
                  border: selectedId === item.id ? "1px solid rgba(96, 165, 250, 0.32)" : buttonStyle.border,
                }}
              >
                <div style={{ fontWeight: 800 }}>{item.username}</div>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 13 }}>
                  {item.email} • {item.role} {item.isActive ? "" : "• Jo aktiv"}
                </div>
              </button>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {selectedId ? "Edito perdoruesin" : "Krijo perdorues te ri"}
            </div>

            <input
              value={form.username}
              onChange={(e) => setForm((v) => ({ ...v, username: e.target.value }))}
              placeholder="Username"
              style={inputStyle}
            />
            <input
              value={form.email}
              onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
              placeholder="Email"
              style={inputStyle}
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
              placeholder={selectedId ? "Password i ri (opsional)" : "Password"}
              style={inputStyle}
            />

            <select
              value={form.role}
              onChange={(e) => setForm((v) => ({ ...v, role: Number(e.target.value) as AdminUserRole }))}
              style={inputStyle}
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((v) => ({ ...v, isActive: e.target.checked }))}
              />
              Aktiv
            </label>

            {err ? (
              <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca" }}>
                {err}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={saving} style={buttonStyle}>
                {saving ? "Duke ruajtur..." : selectedId ? "Ruaj ndryshimet" : "Krijo user"}
              </button>
              <button type="button" onClick={resetForm} style={buttonStyle}>
                Pastro
              </button>
            </div>
          </form>
        </SurfaceCard>
      </div>
    </div>
  );
}
