import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createPartnerPayment,
  getPartnerBalances,
  listPartnerDocuments,
  listPartnerPayments,
  listUnpaidDocuments,
  unpaidDocumentsExcelExportUrl,
  unpaidDocumentsExportUrl,
  unpaidDocumentsPdfExportUrl,
} from "../../services/finance";
import { downloadFile } from "../../services/download";
import { errorMessage } from "../../shared/errors";
import { PageIntro } from "../../shared/ui/PageIntro";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import type {
  PartnerBalanceItemDto,
  PartnerDocumentOptionDto,
  PartnerFinanceBalancesDto,
  PartnerPaymentRecordDto,
  UnpaidDocumentReportItemDto,
} from "../../types/finance";

type PartnerType = "customer" | "supplier";

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

const helperTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "var(--muted)",
  lineHeight: 1.45,
};

function formatMoney(value: number | undefined | null) {
  const formatted = new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
  return `${formatted} €`;
}

function formatDate(value: string | undefined | null) {
  if (!value) return "Pa pagese ende";
  const date = new Date(value);
  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function sameId(a?: string | null, b?: string | null) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function emptyBalances(): PartnerFinanceBalancesDto {
  return {
    customers: [],
    suppliers: [],
    summary: {
      customerDocumentTotal: 0,
      customerPaidTotal: 0,
      customerBalanceTotal: 0,
      supplierDocumentTotal: 0,
      supplierPaidTotal: 0,
      supplierBalanceTotal: 0,
    },
  };
}

export default function PartnerFinancePage() {
  const [searchParams] = useSearchParams();
  const [balances, setBalances] = useState<PartnerFinanceBalancesDto>(emptyBalances);
  const [payments, setPayments] = useState<PartnerPaymentRecordDto[]>([]);
  const [unpaidDocuments, setUnpaidDocuments] = useState<UnpaidDocumentReportItemDto[]>([]);
  const [unpaidPartnerType, setUnpaidPartnerType] = useState<"all" | "customer" | "supplier">("all");
  const [documents, setDocuments] = useState<PartnerDocumentOptionDto[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PartnerType>("customer");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [paymentType, setPaymentType] = useState<PartnerType>("customer");
  const [amount, setAmount] = useState("0");
  const [paymentDate, setPaymentDate] = useState(todayValue);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exportingUnpaid, setExportingUnpaid] = useState(false);
  const [exportingUnpaidExcel, setExportingUnpaidExcel] = useState(false);
  const [exportingUnpaidPdf, setExportingUnpaidPdf] = useState(false);
  const lastPresetKeyRef = useRef("");
  const presetDocumentIdRef = useRef(searchParams.get("documentId") ?? "");
  const presetDocumentNoRef = useRef(searchParams.get("documentNo") ?? searchParams.get("reference") ?? "");
  const requestedDocumentId = searchParams.get("documentId") ?? "";
  const requestedDocumentNo = searchParams.get("documentNo") ?? searchParams.get("reference") ?? "";

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);

    Promise.all([
      getPartnerBalances(query.trim() || undefined, ac.signal),
      listPartnerPayments(query.trim() || undefined, ac.signal),
      listUnpaidDocuments(query.trim() || undefined, unpaidPartnerType, ac.signal),
    ])
      .then(([nextBalances, nextPayments, nextUnpaidDocuments]) => {
        setBalances(nextBalances);
        setPayments(nextPayments);
        setUnpaidDocuments(nextUnpaidDocuments);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [query, unpaidPartnerType]);

  const unpaidSummary = useMemo(
    () => ({
      count: unpaidDocuments.length,
      totalBalance: unpaidDocuments.reduce((sum, item) => sum + item.balance, 0),
      totalDocumentValue: unpaidDocuments.reduce((sum, item) => sum + item.documentTotal, 0),
    }),
    [unpaidDocuments]
  );

  const activeItems = useMemo(
    () => (activeTab === "customer" ? balances.customers : balances.suppliers),
    [activeTab, balances.customers, balances.suppliers]
  );

  const formItems = useMemo(
    () => (paymentType === "customer" ? balances.customers : balances.suppliers),
    [balances.customers, balances.suppliers, paymentType]
  );

  const selectedPartner = useMemo(
    () => formItems.find((x) => sameId(x.id, selectedPartnerId)) ?? null,
    [formItems, selectedPartnerId]
  );

  const selectedDocument = useMemo(
    () => documents.find((x) => sameId(x.id, selectedDocumentId)) ?? null,
    [documents, selectedDocumentId]
  );

  const paymentModeLabel = selectedDocument
    ? `Pagese e lidhur me dokumentin ${selectedDocument.documentNo}`
    : "Pagese e pergjithshme pa dokument";

  useEffect(() => {
    if (!formItems.some((x) => sameId(x.id, selectedPartnerId))) {
      setSelectedPartnerId(formItems[0]?.id ?? "");
    }
  }, [formItems, selectedPartnerId]);

  useEffect(() => {
    const presetKey = searchParams.toString();
    const partnerType = searchParams.get("partnerType") as PartnerType | null;
    const partnerId = searchParams.get("partnerId") ?? "";
    const documentIdFromUrl = searchParams.get("documentId") ?? "";
    const documentNoFromUrl = searchParams.get("documentNo") ?? searchParams.get("reference") ?? "";
    const amountFromUrl = searchParams.get("amount") ?? "";
    const referenceFromUrl = searchParams.get("reference") ?? "";
    const noteFromUrl = searchParams.get("note") ?? "";

    if (lastPresetKeyRef.current === presetKey) return;
    if ((partnerType !== "customer" && partnerType !== "supplier") || !partnerId) return;

    const items = partnerType === "customer" ? balances.customers : balances.suppliers;
    if (!items.some((x) => sameId(x.id, partnerId))) return;

    lastPresetKeyRef.current = presetKey;
    presetDocumentIdRef.current = documentIdFromUrl;
    presetDocumentNoRef.current = documentNoFromUrl;
    setActiveTab(partnerType);
    setPaymentType(partnerType);
    setSelectedPartnerId(partnerId);
    if (amountFromUrl) setAmount(amountFromUrl);
    if (referenceFromUrl) setReference(referenceFromUrl);
    if (noteFromUrl) setNote(noteFromUrl);
  }, [balances.customers, balances.suppliers, searchParams]);

  useEffect(() => {
    if (!selectedPartnerId) {
      setDocuments([]);
      setSelectedDocumentId("");
      return;
    }

    const ac = new AbortController();
    listPartnerDocuments(paymentType, selectedPartnerId, ac.signal)
      .then((items) => {
        setDocuments(items);
        setSelectedDocumentId((current) => {
          const presetDocumentId = presetDocumentIdRef.current;
          const presetDocumentNo = presetDocumentNoRef.current;
          const matchById = presetDocumentId ? items.find((x) => sameId(x.id, presetDocumentId)) : null;
          const matchByNo = presetDocumentNo ? items.find((x) => x.documentNo.trim().toLowerCase() === presetDocumentNo.trim().toLowerCase()) : null;
          const presetMatch = matchById ?? matchByNo;

          if (presetMatch) {
            presetDocumentIdRef.current = "";
            presetDocumentNoRef.current = "";
            return presetMatch.id;
          }
          return items.some((x) => sameId(x.id, current)) ? current : "";
        });
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErr(errorMessage(e));
      });

    return () => ac.abort();
  }, [paymentType, selectedPartnerId]);

  useEffect(() => {
    if (!documents.length) return;

    const matchById = requestedDocumentId
      ? documents.find((x) => sameId(x.id, requestedDocumentId))
      : null;
    const matchByNo = requestedDocumentNo
      ? documents.find((x) => x.documentNo.trim().toLowerCase() === requestedDocumentNo.trim().toLowerCase())
      : null;
    const requestedMatch = matchById ?? matchByNo;

    if (requestedMatch && !sameId(selectedDocumentId, requestedMatch.id)) {
      setSelectedDocumentId(requestedMatch.id);
    }
  }, [documents, requestedDocumentId, requestedDocumentNo, selectedDocumentId]);

  function choosePartner(type: PartnerType, partner: PartnerBalanceItemDto) {
    setActiveTab(type);
    setPaymentType(type);
    setSelectedPartnerId(partner.id);
  }

  async function refreshData(searchValue: string) {
    const [nextBalances, nextPayments] = await Promise.all([
      getPartnerBalances(searchValue.trim() || undefined),
      listPartnerPayments(searchValue.trim() || undefined),
    ]);
    setBalances(nextBalances);
    setPayments(nextPayments);
    setUnpaidDocuments(await listUnpaidDocuments(searchValue.trim() || undefined, unpaidPartnerType));
  }

  async function exportUnpaidDocuments() {
    setExportingUnpaid(true);
    setErr(null);
    try {
      await downloadFile(
        unpaidDocumentsExportUrl(query.trim() || undefined, unpaidPartnerType),
        "dokumente-te-papaguara.csv"
      );
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setExportingUnpaid(false);
    }
  }

  async function exportUnpaidDocumentsExcel() {
    setExportingUnpaidExcel(true);
    setErr(null);
    try {
      await downloadFile(
        unpaidDocumentsExcelExportUrl(query.trim() || undefined, unpaidPartnerType),
        "dokumente-te-papaguara.xlsx"
      );
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setExportingUnpaidExcel(false);
    }
  }

  async function exportUnpaidDocumentsPdf() {
    setExportingUnpaidPdf(true);
    setErr(null);
    try {
      await downloadFile(
        unpaidDocumentsPdfExportUrl(query.trim() || undefined, unpaidPartnerType),
        "dokumente-te-papaguara.pdf"
      );
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setExportingUnpaidPdf(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);

    const parsedAmount = Number(amount);
    if (!selectedPartnerId) {
      setErr("Zgjidh fillimisht partnerin per pagesen.");
      setSaving(false);
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErr("Shuma e pageses duhet te jete me e madhe se zero.");
      setSaving(false);
      return;
    }

    try {
      await createPartnerPayment({
        customerId: paymentType === "customer" ? selectedPartnerId : null,
        supplierId: paymentType === "supplier" ? selectedPartnerId : null,
        outboundDocumentId: paymentType === "customer" ? (selectedDocumentId || null) : null,
        inboundDocumentId: paymentType === "supplier" ? (selectedDocumentId || null) : null,
        amount: parsedAmount,
        paymentDate: paymentDate ? new Date(`${paymentDate}T12:00:00`).toISOString() : null,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });

      setAmount("0");
      setReference("");
      setNote("");
      setSelectedDocumentId("");
      setPaymentDate(todayValue());
      await refreshData(query);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PageIntro
        title="Pagesat dhe borxhet"
        subtitle="Shiko bilancin e klienteve dhe furnizuesve, pastaj regjistro pagesa mbi dokumentet e konfirmuara."
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <SurfaceCard>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Borxhi i klienteve</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10 }}>{formatMoney(balances.summary.customerBalanceTotal)}</div>
          <div style={helperTextStyle}>Shuma qe klientet ende nuk e kane paguar.</div>
        </SurfaceCard>
        <SurfaceCard>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Pagesat nga klientet</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10 }}>{formatMoney(balances.summary.customerPaidTotal)}</div>
          <div style={helperTextStyle}>Arketime te regjistruara ne sistem.</div>
        </SurfaceCard>
        <SurfaceCard>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Borxhi ndaj furnizuesve</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10 }}>{formatMoney(balances.summary.supplierBalanceTotal)}</div>
          <div style={helperTextStyle}>Shuma qe duhet t'u paguajme furnizuesve.</div>
        </SurfaceCard>
        <SurfaceCard>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Pagesat ndaj furnizuesve</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 10 }}>{formatMoney(balances.summary.supplierPaidTotal)}</div>
          <div style={helperTextStyle}>Pagesa te regjistruara per furnizuesit.</div>
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Raporti i dokumenteve te papaguara</div>
            <div style={helperTextStyle}>Dokumente te konfirmuara me balance te hapur per arketim ose pagese.</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={unpaidPartnerType}
              onChange={(e) => setUnpaidPartnerType(e.target.value as "all" | "customer" | "supplier")}
              style={{ ...inputStyle, width: 190 }}
            >
              <option value="all">Te gjitha</option>
              <option value="customer">Kliente</option>
              <option value="supplier">Furnizues</option>
            </select>
            <button
              type="button"
              onClick={exportUnpaidDocumentsExcel}
              disabled={exportingUnpaidExcel}
              style={{
                ...buttonStyle,
                background: "rgba(34, 197, 94, 0.12)",
                border: "1px solid rgba(34, 197, 94, 0.28)",
              }}
            >
              {exportingUnpaidExcel ? "Duke eksportuar..." : "Eksporto Excel"}
            </button>
            <button
              type="button"
              onClick={exportUnpaidDocumentsPdf}
              disabled={exportingUnpaidPdf}
              style={{
                ...buttonStyle,
                background: "rgba(248, 113, 113, 0.12)",
                border: "1px solid rgba(248, 113, 113, 0.28)",
              }}
            >
              {exportingUnpaidPdf ? "Duke eksportuar..." : "Eksporto PDF"}
            </button>
            <button type="button" onClick={exportUnpaidDocuments} disabled={exportingUnpaid} style={buttonStyle}>
              {exportingUnpaid ? "Duke eksportuar..." : "Eksporto CSV"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Dokumente me balance</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{unpaidSummary.count}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Vlera totale</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{formatMoney(unpaidSummary.totalDocumentValue)}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Mbetje per pagesa</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{formatMoney(unpaidSummary.totalBalance)}</div>
          </div>
        </div>

        {unpaidDocuments.length === 0 ? (
          <div style={{ color: "var(--muted-strong)" }}>Nuk ka dokumente me balance te hapur per kete filter.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {unpaidDocuments.slice(0, 8).map((item) => (
              <div
                key={`${item.documentType}-${item.documentId}`}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--panel-soft)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{item.documentNo} • {item.documentType === "inbound" ? "Inbound" : "Outbound"}</div>
                    <div style={{ ...helperTextStyle, marginTop: 4 }}>
                      {item.partnerCode} - {item.partnerName} • {formatDate(item.createdAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 900 }}>{formatMoney(item.balance)}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.paymentStatus}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(148, 163, 184, 0.12)" }}>
                    Totali: {formatMoney(item.documentTotal)}
                  </span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)" }}>
                    Paguar: {formatMoney(item.paidTotal)}
                  </span>
                  <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(251, 191, 36, 0.14)" }}>
                    Mbeten: {formatMoney(item.balance)}
                  </span>
                </div>
              </div>
            ))}
            {unpaidDocuments.length > 8 ? (
              <div style={helperTextStyle}>Po shfaqen 8 dokumentet e para. Per listen e plote perdor eksportin Excel ose CSV.</div>
            ) : null}
          </div>
        )}
      </SurfaceCard>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.9fr", gap: 18 }}>
        <SurfaceCard>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Bilanci i partnereve</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>Kliko partnerin per ta kaluar direkt ne formen e pageses.</div>
            </div>
            <div style={{ minWidth: 280 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kerko sipas kodit ose emrit"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setActiveTab("customer")}
              style={{
                ...buttonStyle,
                background: activeTab === "customer" ? "rgba(96, 165, 250, 0.14)" : buttonStyle.background,
                border: activeTab === "customer" ? "1px solid rgba(96, 165, 250, 0.35)" : buttonStyle.border,
              }}
            >
              Klientet ({balances.customers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("supplier")}
              style={{
                ...buttonStyle,
                background: activeTab === "supplier" ? "rgba(34, 197, 94, 0.14)" : buttonStyle.background,
                border: activeTab === "supplier" ? "1px solid rgba(34, 197, 94, 0.35)" : buttonStyle.border,
              }}
            >
              Furnizuesit ({balances.suppliers.length})
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {loading ? <div>Duke u ngarkuar...</div> : null}
            {!loading && activeItems.length === 0 ? <div>Nuk ka te dhena per kete filter.</div> : null}
            {activeItems.map((item) => {
              const selected = paymentType === activeTab && selectedPartnerId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choosePartner(activeTab, item)}
                  style={{
                    ...buttonStyle,
                    textAlign: "left",
                    background: selected ? "rgba(96, 165, 250, 0.12)" : "var(--panel-soft)",
                    border: selected ? "1px solid rgba(96, 165, 250, 0.32)" : buttonStyle.border,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800 }}>{item.code} - {item.name}</div>
                    <div
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: item.balance > 0 ? "rgba(251, 191, 36, 0.16)" : "rgba(34, 197, 94, 0.12)",
                        color: item.balance > 0 ? "#fde68a" : "#bbf7d0",
                        fontWeight: 700,
                      }}
                    >
                      Bilanci: {formatMoney(item.balance)}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(148, 163, 184, 0.12)" }}>
                      Dokumente: {formatMoney(item.documentTotal)}
                    </span>
                    <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(34, 197, 94, 0.12)" }}>
                      Pagesa: {formatMoney(item.paidTotal)}
                    </span>
                    <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(168, 85, 247, 0.12)" }}>
                      Pagesa e fundit: {formatDate(item.lastPaymentDate)}
                    </span>
                    {!item.isActive ? (
                      <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(248, 113, 113, 0.12)" }}>
                        Jo aktiv
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </SurfaceCard>

        <div style={{ display: "grid", gap: 18 }}>
          <SurfaceCard>
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Regjistro pagese</div>
              <div style={{ ...helperTextStyle, marginTop: -4 }}>
                Per klientet kjo ul borxhin qe ata na kane. Per furnizuesit kjo ul detyrimin qe kemi ndaj tyre.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PartnerType)} style={inputStyle}>
                  <option value="customer">Klient</option>
                  <option value="supplier">Furnizues</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Shuma e pageses"
                  style={inputStyle}
                />
              </div>

              <select value={selectedPartnerId} onChange={(e) => setSelectedPartnerId(e.target.value)} style={inputStyle}>
                {formItems.length === 0 ? <option value="">Nuk ka partner te gatshem</option> : null}
                {formItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>

              {selectedPartner ? (
                <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
                  <div style={{ fontWeight: 700 }}>Bilanci aktual: {formatMoney(selectedPartner.balance)}</div>
                  <div style={{ ...helperTextStyle, marginTop: 4 }}>
                    Dokumente: {formatMoney(selectedPartner.documentTotal)} • Pagesa te regjistruara: {formatMoney(selectedPartner.paidTotal)}
                  </div>
                </div>
              ) : null}

              <div>
                <div
                  style={{
                    marginBottom: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 999,
                    border: selectedDocument ? "1px solid rgba(96, 165, 250, 0.32)" : "1px solid rgba(148, 163, 184, 0.24)",
                    background: selectedDocument ? "rgba(96, 165, 250, 0.12)" : "rgba(255,255,255,0.04)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {paymentModeLabel}
                </div>
                <select value={selectedDocument?.id ?? ""} onChange={(e) => setSelectedDocumentId(e.target.value)} style={inputStyle}>
                  <option value="">Pa dokument specifik</option>
                  {documents.length === 0 ? (
                    <option value="" disabled>
                      Nuk ka dokumente te konfirmuara per kete partner
                    </option>
                  ) : null}
                  {documents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.documentNo} • {item.paymentStatus} • Mbeten {formatMoney(item.balance)}
                    </option>
                  ))}
                </select>
                <div style={helperTextStyle}>
                  {selectedPartner
                    ? documents.length > 0
                      ? `U gjeten ${documents.length} dokumente te konfirmuara per kete partner. Nese e lidh pagesen me nje dokument, sistemi do ta perditesoje statusin e tij.`
                      : "Per partnerin e zgjedhur nuk ka dokumente te konfirmuara per lidhje. Pagesa do te ruhet si pagese e pergjithshme e partnerit."
                    : "Nese e lidh pagesen me dokument, sistemi do te tregoje statusin e tij si i papaguar, pjeserisht i paguar ose plotesisht i paguar."}
                </div>
              </div>

              {selectedDocument ? (
                <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-soft)" }}>
                  <div style={{ fontWeight: 700 }}>{selectedDocument.documentNo} • {selectedDocument.paymentStatus}</div>
                  <div style={{ ...helperTextStyle, marginTop: 4 }}>
                    Totali: {formatMoney(selectedDocument.documentTotal)} • Te paguara: {formatMoney(selectedDocument.paidTotal)} • Mbetja: {formatMoney(selectedDocument.balance)}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={inputStyle} />
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referenca e pageses" style={inputStyle} />
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Shenim per pagesen"
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
              />

              {err ? (
                <div style={{ padding: 12, borderRadius: 12, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.24)", color: "#fecaca" }}>
                  {err}
                </div>
              ) : null}

              <button type="submit" disabled={saving || !selectedPartnerId} style={buttonStyle}>
                {saving ? "Duke ruajtur..." : "Ruaj pagesen"}
              </button>
            </form>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Pagesat e fundit</div>
            <div style={{ display: "grid", gap: 10 }}>
              {loading ? <div>Duke u ngarkuar...</div> : null}
              {!loading && payments.length === 0 ? <div>Nuk ka pagesa te regjistruara ende.</div> : null}
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "var(--panel-soft)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>
                      {payment.partnerCode} - {payment.partnerName}
                    </div>
                    <div style={{ fontWeight: 800 }}>{formatMoney(payment.amount)}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-strong)" }}>
                    {payment.partnerType === "customer" ? "Klient" : "Furnizues"} • {formatDate(payment.paymentDate)}
                    {payment.documentNo ? ` • Dok: ${payment.documentNo}` : ""}
                    {payment.reference ? ` • Ref: ${payment.reference}` : ""}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        padding: "5px 8px",
                        borderRadius: 999,
                        background: payment.documentNo ? "rgba(96, 165, 250, 0.12)" : "rgba(148, 163, 184, 0.12)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {payment.documentNo ? "Pagese e lidhur me dokument" : "Pagese e pergjithshme"}
                    </span>
                  </div>
                  {payment.note ? <div style={{ marginTop: 6, fontSize: 13 }}>{payment.note}</div> : null}
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
