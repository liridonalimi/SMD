import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../shared/errors";
import { ImportPanel } from "../../shared/ImportPanel";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import type { ImportResult } from "../../types/import";
import type { PartnerRecordDto, UpsertPartnerDto } from "../../types/partners";

type Props = {
  title: string;
  subtitle: string;
  entityLabel: string;
  listItems: (q?: string, signal?: AbortSignal) => Promise<PartnerRecordDto[]>;
  createItem: (body: UpsertPartnerDto, signal?: AbortSignal) => Promise<unknown>;
  updateItem: (id: string, body: UpsertPartnerDto, signal?: AbortSignal) => Promise<unknown>;
  importFile?: (file: File, updateExisting: boolean, signal?: AbortSignal) => Promise<ImportResult>;
};

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

export default function PartnerDirectoryPage(props: Props) {
  const { title, subtitle, entityLabel, listItems, createItem, updateItem } = props;
  const [items, setItems] = useState<PartnerRecordDto[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<UpsertPartnerDto>({
    code: "",
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    note: "",
    isActive: true,
  });

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    listItems(query.trim() || undefined, ac.signal)
      .then((data) => {
        setItems(data);
        if (selectedId) {
          const current = data.find((x) => x.id === selectedId);
          if (!current) setSelectedId(null);
        }
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [listItems, query, selectedId]);

  const selectedItem = useMemo(
    () => items.find((x) => x.id === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    if (!selectedItem) return;
    setForm({
      code: selectedItem.code,
      name: selectedItem.name,
      contactPerson: selectedItem.contactPerson ?? "",
      phone: selectedItem.phone ?? "",
      email: selectedItem.email ?? "",
      address: selectedItem.address ?? "",
      note: selectedItem.note ?? "",
      isActive: selectedItem.isActive,
    });
  }, [selectedItem]);

  function resetForm() {
    setSelectedId(null);
    setForm({
      code: "",
      name: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      note: "",
      isActive: true,
    });
  }

  async function refreshItems() {
    const refreshed = await listItems(query.trim() || undefined);
    setItems(refreshed);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const payload: UpsertPartnerDto = {
      code: form.code?.trim() ?? "",
      name: form.name?.trim() ?? "",
      contactPerson: form.contactPerson?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      address: form.address?.trim() || null,
      note: form.note?.trim() || null,
      isActive: form.isActive ?? true,
    };

    try {
      if (selectedId) {
        await updateItem(selectedId, payload);
      } else {
        await createItem(payload);
      }
      resetForm();
      await refreshItems();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageIntro title={title} subtitle={subtitle} />

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.95fr", gap: 18 }}>
        <SurfaceCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Lista e {entityLabel.toLowerCase()}ve</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>Kerko dhe zgjidh nje partner per editim te shpejte.</div>
            </div>
            <div style={{ minWidth: 260 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Kerko ${entityLabel.toLowerCase()} sipas kodit ose emrit`}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {loading ? <div>Duke u ngarkuar...</div> : null}
            {!loading && items.length === 0 ? <div>Nuk ka te dhena.</div> : null}
            {items.map((item) => (
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
                <div style={{ fontWeight: 800 }}>{item.code} - {item.name}</div>
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
                  {item.contactPerson || "Pa person kontakti"} {item.phone ? `• ${item.phone}` : ""} {item.isActive ? "" : "• Jo aktiv"}
                </div>
              </button>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {selectedId ? `Perditeso ${entityLabel.toLowerCase()}n` : `Shto ${entityLabel.toLowerCase()} te ri`}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}>
              <input value={form.code ?? ""} onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))} placeholder="Kodi" style={inputStyle} />
              <input value={form.name ?? ""} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} placeholder="Emri" style={inputStyle} />
            </div>

            <input value={form.contactPerson ?? ""} onChange={(e) => setForm((v) => ({ ...v, contactPerson: e.target.value }))} placeholder="Personi kontaktues" style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input value={form.phone ?? ""} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder="Telefoni" style={inputStyle} />
              <input value={form.email ?? ""} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} placeholder="Email" style={inputStyle} />
            </div>
            <input value={form.address ?? ""} onChange={(e) => setForm((v) => ({ ...v, address: e.target.value }))} placeholder="Adresa" style={inputStyle} />
            <textarea value={form.note ?? ""} onChange={(e) => setForm((v) => ({ ...v, note: e.target.value }))} placeholder="Shenim" rows={4} style={{ ...inputStyle, resize: "vertical" }} />

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.isActive ?? true}
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
                {saving ? "Duke ruajtur..." : selectedId ? "Ruaj ndryshimet" : "Shto"}
              </button>
              <button type="button" onClick={resetForm} style={buttonStyle}>
                Pastro
              </button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      {props.importFile ? (
        <SurfaceCard>
          <ImportPanel
            title="Import nga XLSX, XLS ose CSV"
            hint="Header-at kryesore: code, name, contactPerson, phone, email, address, note, isActive. Kodi dhe emri jane te detyrueshem."
            importFile={props.importFile}
            onImported={refreshItems}
          />
        </SurfaceCard>
      ) : null}
    </div>
  );
}
