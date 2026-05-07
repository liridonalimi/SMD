import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createInboundDraft } from "../../services/inbound";
import { createOutboundDraft } from "../../services/outbound";
import { listCustomersLookup, listSuppliersLookup } from "../../services/partners";
import { errorMessage } from "../../shared/errors";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { FieldLabel } from "../../shared/ui/FieldLabel";
import type { PartnerLookupDto } from "../../types/partners";

type DraftKind = "inbound" | "outbound";

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(96, 165, 250, 0.28)",
  background: "rgba(96, 165, 250, 0.14)",
  color: "var(--text)",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--panel-soft)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
};

export default function DocumentCreatePage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get("type");
  const initialKind = typeParam === "outbound" ? "outbound" : "inbound";
  const isPresetKind = typeParam === "inbound" || typeParam === "outbound";
  const [kind, setKind] = useState<DraftKind>(initialKind);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partners, setPartners] = useState<PartnerLookupDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const load = kind === "inbound" ? listSuppliersLookup : listCustomersLookup;
    load(undefined, ac.signal)
      .then(setPartners)
      .catch(() => setPartners([]));
    setPartnerId("");
    return () => ac.abort();
  }, [kind]);

  function normalizeReference(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);

    const normalizedReference = normalizeReference(reference);
    if (reference.trim().length > 0 && normalizedReference.length < 3) {
      setErr("Referenca duhet te kete te pakten 3 karaktere ose te lihet bosh.");
      return;
    }

    setSaving(true);

    const body = {
      ...(kind === "inbound" ? { supplierId: partnerId || null } : { customerId: partnerId || null }),
      reference: normalizedReference || null,
      note: note.trim() || null,
    };

    try {
      const created = kind === "inbound"
        ? await createInboundDraft(body)
        : await createOutboundDraft(body);

      nav(kind === "inbound" ? `/inbound/${created.id}` : `/outbound/${created.id}`, {
        state: {
          from: "/documents/new",
          successMessage: `Dokumenti ${created.documentNo} u krijua me sukses. Tani shto produktet ne dokument.`,
        },
      });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageIntro
        title="Dokument i ri"
        subtitle={
          isPresetKind
            ? `Ploteso formen e shkurter per te krijuar nje dokument te ri ${kind === "inbound" ? "Inbound" : "Outbound"} dhe vazhdo direkt me rreshtat e dokumentit.`
            : "Ploteso formen e shkurter per te krijuar nje draft te ri Inbound ose Outbound dhe vazhdo direkt me rreshtat e dokumentit."
        }
        actions={
          <button type="button" onClick={() => nav(-1)} style={secondaryButtonStyle}>
            Prapa
          </button>
        }
      />

      <SurfaceCard style={{ maxWidth: 820 }}>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 18 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--panel-soft)), var(--panel-soft))",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>Krijo draft dokumenti</div>
            <div style={{ marginTop: 6, color: "var(--muted)" }}>
              Zgjidh llojin e dokumentit dhe ploteso te dhenat baze. Numri i dokumentit gjenerohet automatikisht nga sistemi.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {isPresetKind ? (
              <div>
                <FieldLabel>Lloji i dokumentit</FieldLabel>
                <div
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--panel-soft)",
                    fontWeight: 700,
                  }}
                >
                  {kind === "inbound" ? "Inbound / Dokument hyres" : "Outbound / Dokument dales"}
                </div>
              </div>
            ) : (
              <div>
                <FieldLabel>Lloji i dokumentit</FieldLabel>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as DraftKind)}
                  style={{ width: "100%", padding: 12, borderRadius: 12 }}
                >
                  <option value="inbound">Inbound / Dokument hyres</option>
                  <option value="outbound">Outbound / Dokument dales</option>
                </select>
              </div>
            )}
            <div>
              <FieldLabel>{kind === "inbound" ? "Furnizuesi" : "Klienti"}</FieldLabel>
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 12 }}
              >
                <option value="">{kind === "inbound" ? "Pa furnizues te lidhur" : "Pa klient te lidhur"}</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Referenca</FieldLabel>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={kind === "inbound" ? "p.sh. PO-2026-014" : "p.sh. SO-2026-021"}
                maxLength={80}
                style={{ width: "100%", padding: 12, borderRadius: 12 }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                Opsionale. Nese plotesohet, duhet te jete e qarte dhe jo vetem boshllëqe.
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Shenim</FieldLabel>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Shto nje pershkrim te shkurter ose instruksion per kete dokument"
              rows={5}
              style={{ width: "100%", padding: 12, borderRadius: 12, resize: "vertical" }}
            />
          </div>

          {err ? (
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(248, 113, 113, 0.28)",
                background: "rgba(248, 113, 113, 0.12)",
                color: "#fecaca",
              }}
            >
              {err}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Duke krijuar..." : "Krijo dokumentin"}
            </button>

            <button type="button" disabled={saving} onClick={() => nav(kind === "inbound" ? "/inbound" : "/outbound")} style={secondaryButtonStyle}>
              Shko te lista
            </button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}
