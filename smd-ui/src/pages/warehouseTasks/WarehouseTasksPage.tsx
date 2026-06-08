import { useEffect, useRef, useState } from "react";
import {
  assignWarehouseTask,
  cancelWarehouseTask,
  completeWarehouseTask,
  createWarehouseTask,
  generateCountingTasks,
  generatePickingTasks,
  generatePutawayTasks,
  regeneratePutawayTasks,
  getWarehouseTaskDailyReport,
  getWarehouseTaskMetrics,
  listWarehouseTasks,
  regeneratePickingTasks,
  regenerateCountingTasks,
  reportWarehouseTaskProblem,
  requestWarehouseTaskHelp,
  resolveWarehouseTaskHelp,
  startWarehouseTask,
} from "../../services/warehouseTasks";
import type { WarehouseTaskDailyReportResponse, WarehouseTaskDto, WarehouseTaskMetricsResponse, WarehouseTaskStatus, WarehouseTaskType } from "../../types/warehouseTasks";
import { getSessionUser } from "../../shared/session";
import { listInbound } from "../../services/inbound";
import { listOutbound } from "../../services/outbound";
import { listCycleCounts } from "../../services/cycleCounts";
import type { DocumentListItem } from "../../types/documents";
import type { CycleCountListItemDto } from "../../types/cycleCounts";
import { searchProducts, type ProductHitDto } from "../../services/products";
import { searchBins, type BinHitDto } from "../../services/bins";

const types: WarehouseTaskType[] = ["Putaway", "Replenishment", "Picking", "Counting"];
const statuses: WarehouseTaskStatus[] = ["Open", "InProgress", "Blocked", "Done", "Cancelled"];

const sqType: Record<WarehouseTaskType, string> = {
  Putaway: "Vendosje ne Shporta",
  Replenishment: "Rimbushje",
  Picking: "Marrje porosie",
  Counting: "Numerim",
};

const sqStatus: Record<WarehouseTaskStatus, string> = {
  Open: "Hapur",
  InProgress: "Ne pune",
  Blocked: "Ka problem",
  Done: "Perfunduar",
  Cancelled: "Anuluar",
};

function fmtDate(v?: string | null) {
  if (!v) return "-";
  return new Intl.DateTimeFormat("sq-AL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
}

function fmtNumber(v?: number | null) {
  if (v == null) return "-";
  return new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 2 }).format(v);
}

export default function WarehouseTasksPage() {
  const autoBoxRef = useRef<HTMLDivElement | null>(null);
  const taskListRef = useRef<HTMLElement | null>(null);
  const me = getSessionUser();

  const [items, setItems] = useState<WarehouseTaskDto[]>([]);
  const [myItems, setMyItems] = useState<WarehouseTaskDto[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<WarehouseTaskDto[]>([]);
  const [problemItems, setProblemItems] = useState<WarehouseTaskDto[]>([]);
  const [helpItems, setHelpItems] = useState<WarehouseTaskDto[]>([]);
  const [metrics, setMetrics] = useState<WarehouseTaskMetricsResponse | null>(null);
  const [dailyReport, setDailyReport] = useState<WarehouseTaskDailyReportResponse | null>(null);
  const [status, setStatus] = useState<WarehouseTaskStatus | "">("");
  const [type, setType] = useState<WarehouseTaskType | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [newType, setNewType] = useState<WarehouseTaskType>("Replenishment");
  const [productTerm, setProductTerm] = useState("");
  const [fromBinTerm, setFromBinTerm] = useState("");
  const [toBinTerm, setToBinTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductHitDto | null>(null);
  const [selectedFromBin, setSelectedFromBin] = useState<BinHitDto | null>(null);
  const [selectedToBin, setSelectedToBin] = useState<BinHitDto | null>(null);
  const [productHits, setProductHits] = useState<ProductHitDto[]>([]);
  const [fromBinHits, setFromBinHits] = useState<BinHitDto[]>([]);
  const [toBinHits, setToBinHits] = useState<BinHitDto[]>([]);
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const [inboundId, setInboundId] = useState("");
  const [outboundId, setOutboundId] = useState("");
  const [countingId, setCountingId] = useState("");
  const [inboundHits, setInboundHits] = useState<DocumentListItem[]>([]);
  const [outboundHits, setOutboundHits] = useState<DocumentListItem[]>([]);
  const [countingHits, setCountingHits] = useState<CycleCountListItemDto[]>([]);
  const [activeAuto, setActiveAuto] = useState<"inbound" | "outbound" | "counting" | "product" | "fromBin" | "toBin" | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [list, metric, report, myOpen, myProgress, myBlocked, openPool, progressPool, blockedPool, problems, help] = await Promise.all([
        listWarehouseTasks(status, type, page, pageSize),
        getWarehouseTaskMetrics(),
        getWarehouseTaskDailyReport(),
        me?.userId ? listWarehouseTasks("Open", "", 1, 20, me.userId) : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20 }),
        me?.userId ? listWarehouseTasks("InProgress", "", 1, 20, me.userId) : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20 }),
        me?.userId ? listWarehouseTasks("Blocked", "", 1, 20, me.userId) : Promise.resolve({ data: [], total: 0, page: 1, pageSize: 20 }),
        listWarehouseTasks("Open", "", 1, 100),
        listWarehouseTasks("InProgress", "", 1, 100),
        listWarehouseTasks("Blocked", "", 1, 100),
        listWarehouseTasks("Blocked", "", 1, 20),
        listWarehouseTasks("", "", 1, 20, null, true),
      ]);
      setItems(list.data);
      setTotal(list.total);
      setMetrics(metric);
      setDailyReport(report);
      setMyItems([...myBlocked.data, ...myProgress.data, ...myOpen.data].slice(0, 8));
      setUnassignedItems([...blockedPool.data, ...openPool.data, ...progressPool.data].filter((x) => !x.assignedToUserId).slice(0, 8));
      setProblemItems(problems.data);
      setHelpItems(help.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nuk u lexuan veprimet e depose.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [status, type, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [status, type, pageSize]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!autoBoxRef.current) return;
      if (!autoBoxRef.current.contains(e.target as Node)) {
        setActiveAuto(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = inboundId.trim();
    if (q.length < 2 || activeAuto !== "inbound") {
      setInboundHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await listInbound({ page: 1, pageSize: 8, q, status: 1 });
        setInboundHits(res.items ?? []);
      } catch {
        setInboundHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [inboundId, activeAuto]);

  useEffect(() => {
    const q = outboundId.trim();
    if (q.length < 2 || activeAuto !== "outbound") {
      setOutboundHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await listOutbound({ page: 1, pageSize: 8, q, status: 1 });
        setOutboundHits(res.items ?? []);
      } catch {
        setOutboundHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [outboundId, activeAuto]);

  useEffect(() => {
    const q = countingId.trim().toLowerCase();
    if (q.length < 2 || activeAuto !== "counting") {
      setCountingHits([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await listCycleCounts("Draft");
        const filtered = res.filter((x) => x.countNo.toLowerCase().includes(q)).slice(0, 8);
        setCountingHits(filtered);
      } catch {
        setCountingHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [countingId, activeAuto]);

  useEffect(() => {
    const q = productTerm.trim();
    if (selectedProduct && `${selectedProduct.sku} - ${selectedProduct.name}` !== productTerm)
      setSelectedProduct(null);
    if (q.length < 2 || activeAuto !== "product") {
      setProductHits([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setProductHits(await searchProducts(q));
      } catch {
        setProductHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [productTerm, activeAuto, selectedProduct]);

  useEffect(() => {
    const q = fromBinTerm.trim();
    if (selectedFromBin && `${selectedFromBin.code} - ${selectedFromBin.name}` !== fromBinTerm)
      setSelectedFromBin(null);
    if (q.length < 2 || activeAuto !== "fromBin") {
      setFromBinHits([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setFromBinHits(await searchBins(q));
      } catch {
        setFromBinHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [fromBinTerm, activeAuto, selectedFromBin]);

  useEffect(() => {
    const q = toBinTerm.trim();
    if (selectedToBin && `${selectedToBin.code} - ${selectedToBin.name}` !== toBinTerm)
      setSelectedToBin(null);
    if (q.length < 2 || activeAuto !== "toBin") {
      setToBinHits([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setToBinHits(await searchBins(q));
      } catch {
        setToBinHits([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [toBinTerm, activeAuto, selectedToBin]);

  async function runAction(action: () => Promise<unknown>) {
    try {
      setError(null);
      setInfo(null);
      await action();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veprimi deshtoi.");
    }
  }

  async function reportProblem(task: WarehouseTaskDto) {
    const reason = window.prompt(
      "Shkruaj arsyen pse kjo pune nuk mund te kryhet.\nShembuj: Nuk ka stok, shporta nuk gjendet, sasia nuk perputhet, produkti eshte gabim."
    );
    if (!reason?.trim()) return;

    await runAction(() => reportWarehouseTaskProblem(task.id, reason.trim()));
  }

  async function requestHelp(task: WarehouseTaskDto) {
    const reason = window.prompt(
      "Shkruaj shkurt cfare ndihme te duhet.\nShembuj: Duhet konfirmim, nuk jam i sigurt per shporten, kerkohet menaxheri."
    );
    if (!reason?.trim()) return;

    await runAction(() => requestWarehouseTaskHelp(task.id, reason.trim()));
  }

  function showProblemList() {
    setStatus("Blocked");
    setType("");
    setPage(1);
    window.setTimeout(() => {
      taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function runGenerateAction(
    action: () => Promise<{ created: number }>,
    zeroMessage: string,
    successMessage: string
  ) {
    try {
      setError(null);
      setInfo(null);
      const res = await action();
      await loadAll();
      if (res.created <= 0) setInfo(zeroMessage);
      else setInfo(`${successMessage}: ${res.created}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veprimi deshtoi.");
    }
  }

  async function regenerate(kind: "putaway" | "picking" | "counting", ref: string) {
    const ok = window.confirm("Kjo do anuloj veprimet,task e hapura ekzistuese dhe gjeneron task-e te reja. Vazhdo?");
    if (!ok) return;

    if (kind === "putaway") return runAction(() => regeneratePutawayTasks(ref));
    if (kind === "picking") return runAction(() => regeneratePickingTasks(ref));
    return runAction(() => regenerateCountingTasks(ref));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div ref={autoBoxRef} style={{ display: "grid", gap: 16 }}>
      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <h1 style={{ marginTop: 0 }}>Veprimet automatike ne Depo</h1>
        <p style={{ marginTop: 6, color: "var(--muted)" }}>
          Menaxhim i veprimeve te punes per vendosje ne shporta, rimbushje, plotesim, mbledhje te porosive dhe numerim.
        </p>
        {metrics ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <Kpi label="Gjithsej veprime" value={metrics.total} />
            <Kpi label="Hapur" value={metrics.byStatus.Open ?? 0} />
            <Kpi label="Ne pune" value={metrics.byStatus.InProgress ?? 0} />
            <Kpi label="Ka problem" value={metrics.byStatus.Blocked ?? 0} />
            <Kpi label="Perfunduar" value={metrics.byStatus.Done ?? 0} />
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid rgba(34,197,94,0.24)", borderRadius: 16, padding: 16, background: "linear-gradient(180deg, rgba(34,197,94,0.10), var(--panel))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#bbf7d0", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Raporti i dites
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Si po ecen puna sot</h2>
            <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
              Pamje e shpejte per punet e hapura, te marra, te perfunduara dhe ato me problem.
            </div>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{dailyReport ? fmtDate(dailyReport.date) : "-"}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <Kpi label="Hapur sot" value={dailyReport?.openedToday ?? 0} />
          <Kpi label="Marre nga punetoret" value={dailyReport?.assignedToday ?? 0} />
          <Kpi label="Ne pune tani" value={dailyReport?.inProgressToday ?? 0} />
          <Kpi label="Perfunduar sot" value={dailyReport?.completedToday ?? 0} />
          <Kpi label="Me problem sot" value={dailyReport?.problemToday ?? 0} />
        </div>

        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 10px" }}>Kush ka kryer cka</h3>
          {dailyReport?.workers?.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {dailyReport.workers.map((worker) => (
                <div
                  key={worker.userId ?? worker.workerName}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 1fr) repeat(3, minmax(90px, auto))",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 10,
                    background: "var(--panel-soft)",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{worker.workerName}</div>
                  <SmallInfo label="Perfunduar" value={String(worker.completed)} />
                  <SmallInfo label="Ne pune" value={String(worker.inProgress)} />
                  <SmallInfo label="Problem" value={String(worker.problems)} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--panel-soft)" }}>
              Ende nuk ka pune te regjistruara per punetore sot.
            </div>
          )}
        </div>
      </section>

      <section style={{ border: "1px solid rgba(96,165,250,0.24)", borderRadius: 16, padding: 16, background: "linear-gradient(180deg, rgba(59,130,246,0.11), var(--panel))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#bfdbfe", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pamje e thjeshte per punetor
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Punet e mia sot</h2>
            <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
              Merre nje pune, filloje dhe perfundoje kur kryhet ne depo.
            </div>
          </div>
          <button onClick={() => void loadAll()} disabled={loading}>Rifresko</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 14 }}>
          <WorkList
            title="Punet qe i kam une"
            empty="Nuk ke pune te hapura per momentin."
            items={myItems}
            action={(task) => (
              <>
                {task.status === "Open" ? <button onClick={() => runAction(() => startWarehouseTask(task.id))}>Fillo</button> : null}
                {task.status === "Blocked" ? <button onClick={() => runAction(() => startWarehouseTask(task.id))}>Rifillo punen</button> : null}
                {task.status !== "Done" && task.status !== "Cancelled" && task.status !== "Blocked" ? <button onClick={() => runAction(() => completeWarehouseTask(task.id))}>Perfundo</button> : null}
                {task.status !== "Done" && task.status !== "Cancelled" ? <button onClick={() => void requestHelp(task)}>Kerko ndihme</button> : null}
                {task.status !== "Done" && task.status !== "Cancelled" ? <button onClick={() => void reportProblem(task)}>Ka problem</button> : null}
              </>
            )}
          />

          <WorkList
            title="Pune pa punetor"
            empty="Nuk ka pune te lira per momentin."
            items={unassignedItems}
            action={(task) => (
              <button
                disabled={!me?.userId}
                onClick={() => runAction(() => assignWarehouseTask(task.id, me?.userId))}
              >
                Merr punen
              </button>
            )}
          />
        </div>
      </section>

      <section style={{ border: "1px solid rgba(251,191,36,0.28)", borderRadius: 16, padding: 16, background: "linear-gradient(180deg, rgba(251,191,36,0.10), var(--panel))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#fde68a", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pse nuk u kry puna
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Punet me problem</h2>
            <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
              Ketu menaxheri sheh menjehere cka e ka ndal punen ne depo dhe kush e ka ne dore.
            </div>
          </div>
          <button onClick={showProblemList}>Shiko listen</button>
        </div>

        <ProblemList
          items={problemItems}
          onRestart={(task) => runAction(() => startWarehouseTask(task.id))}
          onAssign={(task) => runAction(() => assignWarehouseTask(task.id, me?.userId))}
          canAssign={Boolean(me?.userId)}
        />
      </section>

      <section style={{ border: "1px solid rgba(56,189,248,0.26)", borderRadius: 16, padding: 16, background: "linear-gradient(180deg, rgba(14,165,233,0.10), var(--panel))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#bae6fd", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Kerkesa per ndihme
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Punetoret qe presin ndihme</h2>
            <div style={{ color: "var(--muted-strong)", marginTop: 6, fontSize: 13 }}>
              Keto pune nuk jane bllokuar, por punetori ka kerkuar sqarim ose konfirmim.
            </div>
          </div>
          <button onClick={() => void loadAll()} disabled={loading}>Rifresko</button>
        </div>

        <HelpList
          items={helpItems}
          onResolve={(task) => runAction(() => resolveWarehouseTaskHelp(task.id))}
          onRestart={(task) => runAction(() => startWarehouseTask(task.id))}
        />
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
              <h2 style={{ marginTop: 0 }}>Nderto veprime automatik per dokumente</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
            <input value={inboundId} onFocus={() => setActiveAuto("inbound")} onChange={(e) => setInboundId(e.target.value)} placeholder="IN-000055" />
            <button
              onClick={() => runGenerateAction(() => generatePutawayTasks(inboundId), "Nuk u krijua asnje veprim vendosjeje.", "U krijuan veprime vendosjeje")}
              disabled={!inboundId}
            >
              Nderto veprimet
            </button>
            <button onClick={() => regenerate("putaway", inboundId)} disabled={!inboundId}>Nderto perseri</button>
            {activeAuto === "inbound" && inboundHits.length > 0 ? (
              <AutoList>
                {inboundHits.map((x) => (
                  <AutoItem key={x.id} onPick={() => { setInboundId(x.documentNo); setInboundHits([]); setActiveAuto(null); }}>
                    <strong>{x.documentNo}</strong>{x.reference ? ` - ${x.reference}` : ""}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
            <input value={outboundId} onFocus={() => setActiveAuto("outbound")} onChange={(e) => setOutboundId(e.target.value)} placeholder="OUT-000025" />
            <button
              onClick={() =>
                runGenerateAction(
                  () => generatePickingTasks(outboundId),
                  "Nuk u krijua asnje veprim mbledhjeje. Arsye e mundshme: stoku eshte i mjaftueshem, nuk ka depo burim me stok, u kalua ora kufi (cutoff) per depo te largeta, ose depoja burim e ka mbushur kapacitetin ditor.",
                  "U krijuan veprime mbledhjeje"
                )
              }
              disabled={!outboundId}
            >
              Nderto veprimet
            </button>
                      <button onClick={() => regenerate("picking", outboundId)} disabled={!outboundId}>Nderto perseri</button>
            {activeAuto === "outbound" && outboundHits.length > 0 ? (
              <AutoList>
                {outboundHits.map((x) => (
                  <AutoItem key={x.id} onPick={() => { setOutboundId(x.documentNo); setOutboundHits([]); setActiveAuto(null); }}>
                    <strong>{x.documentNo}</strong>{x.reference ? ` - ${x.reference}` : ""}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
            <input value={countingId} onFocus={() => setActiveAuto("counting")} onChange={(e) => setCountingId(e.target.value)} placeholder="NR-000006" />
            <button
              onClick={() => runGenerateAction(() => generateCountingTasks(countingId), "Nuk u krijua asnje veprim numerimi.", "U krijuan veprime numerimi")}
              disabled={!countingId}
            >
              Nderto numrime
            </button>
                      <button onClick={() => regenerate("counting", countingId)} disabled={!countingId}>Nderto perseri</button>
            {activeAuto === "counting" && countingHits.length > 0 ? (
              <AutoList>
                {countingHits.map((x) => (
                  <AutoItem key={x.id} onPick={() => { setCountingId(x.countNo); setCountingHits([]); setActiveAuto(null); }}>
                    <strong>{x.countNo}</strong>{x.reference ? ` - ${x.reference}` : ""}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>
        </div>
        {info ? (
          <div style={{ marginTop: 10, color: "#9fd3ff", fontSize: 13 }}>
            {info}
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <h2 style={{ marginTop: 0 }}>Nderto nje rrjedh te veprimit manualisht</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value as WarehouseTaskType)}>
            {types.map((t) => (
              <option key={t} value={t}>{sqType[t]}</option>
            ))}
          </select>

          <div style={{ position: "relative" }}>
            <input value={productTerm} onFocus={() => setActiveAuto("product")} onChange={(e) => setProductTerm(e.target.value)} placeholder="Produkti (SKU ose emer)" style={{ paddingRight: 36 }} />
            {selectedProduct ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedProduct(null);
                  setProductTerm("");
                }}
                style={{ position: "absolute", right: 8, top: 8, border: "1px solid var(--border)", background: "var(--panel-soft)", borderRadius: 999, width: 22, height: 22, lineHeight: "18px", padding: 0, zIndex: 7 }}
                aria-label="Hiq produktin e zgjedhur"
                title="Hiq"
              >
                x
              </button>
            ) : null}
            {activeAuto === "product" && productHits.length > 0 ? (
              <AutoList>
                {productHits.slice(0, 8).map((x) => (
                  <AutoItem key={x.id} onPick={() => { setSelectedProduct(x); setProductTerm(`${x.sku} - ${x.name}`); setProductHits([]); setActiveAuto(null); }}>
                    <strong>{x.sku}</strong> - {x.name}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>

          <div style={{ position: "relative" }}>
            <input value={fromBinTerm} onFocus={() => setActiveAuto("fromBin")} onChange={(e) => setFromBinTerm(e.target.value)} placeholder="Nga shporta (opsionale)" style={{ paddingRight: 36 }} />
            {selectedFromBin ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedFromBin(null);
                  setFromBinTerm("");
                }}
                style={{ position: "absolute", right: 8, top: 8, border: "1px solid var(--border)", background: "var(--panel-soft)", borderRadius: 999, width: 22, height: 22, lineHeight: "18px", padding: 0, zIndex: 7 }}
                aria-label="Hiq shporten nga"
                title="Hiq"
              >
                x
              </button>
            ) : null}
            {activeAuto === "fromBin" && fromBinHits.length > 0 ? (
              <AutoList>
                {fromBinHits.slice(0, 8).map((x) => (
                  <AutoItem key={x.id} onPick={() => { setSelectedFromBin(x); setFromBinTerm(`${x.code} - ${x.name}`); setFromBinHits([]); setActiveAuto(null); }}>
                    <strong>{x.code}</strong> - {x.name}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>

          <div style={{ position: "relative" }}>
            <input value={toBinTerm} onFocus={() => setActiveAuto("toBin")} onChange={(e) => setToBinTerm(e.target.value)} placeholder="Ne shporte (opsionale)" style={{ paddingRight: 36 }} />
            {selectedToBin ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedToBin(null);
                  setToBinTerm("");
                }}
                style={{ position: "absolute", right: 8, top: 8, border: "1px solid var(--border)", background: "var(--panel-soft)", borderRadius: 999, width: 22, height: 22, lineHeight: "18px", padding: 0, zIndex: 7 }}
                aria-label="Hiq shporten ne"
                title="Hiq"
              >
                x
              </button>
            ) : null}
            {activeAuto === "toBin" && toBinHits.length > 0 ? (
              <AutoList>
                {toBinHits.slice(0, 8).map((x) => (
                  <AutoItem key={x.id} onPick={() => { setSelectedToBin(x); setToBinTerm(`${x.code} - ${x.name}`); setToBinHits([]); setActiveAuto(null); }}>
                    <strong>{x.code}</strong> - {x.name}
                  </AutoItem>
                ))}
              </AutoList>
            ) : null}
          </div>

          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Sasia (opsionale)" />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referenca (opsionale)" />
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shenim (opsionale)" rows={2} style={{ marginTop: 10, width: "100%" }} />

        <button
          style={{ marginTop: 10 }}
          onClick={() =>
            runAction(async () => {
              if (productTerm.trim() && !selectedProduct) throw new Error("Zgjidh produktin nga lista e sugjerimeve.");
              if (fromBinTerm.trim() && !selectedFromBin) throw new Error("Zgjidh shporten 'Nga' nga lista e sugjerimeve.");
              if (toBinTerm.trim() && !selectedToBin) throw new Error("Zgjidh shporten 'Ne' nga lista e sugjerimeve.");

              await createWarehouseTask({
                type: newType,
                productId: selectedProduct?.id ?? null,
                fromBinId: selectedFromBin?.id ?? null,
                toBinId: selectedToBin?.id ?? null,
                quantity: quantity ? Number(quantity) : null,
                reference: reference || null,
                note: note || null,
              });

              setProductTerm("");
              setFromBinTerm("");
              setToBinTerm("");
              setSelectedProduct(null);
              setSelectedFromBin(null);
              setSelectedToBin(null);
              setQuantity("");
              setReference("");
              setNote("");
            })
          }
        >
          Krijo task
        </button>
      </section>

      <section ref={taskListRef} style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Lista e veprimeve</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value as WarehouseTaskStatus | "")}> 
            <option value="">Te gjitha statuset</option>
            {statuses.map((s) => <option key={s} value={s}>{sqStatus[s]}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as WarehouseTaskType | "")}> 
            <option value="">Te gjitha tipet</option>
            {types.map((t) => <option key={t} value={t}>{sqType[t]}</option>)}
          </select>
          <button onClick={() => { setStatus(""); setType(""); setPage(1); }}>Pastro filtrat</button>
        </div>

        {loading ? <div>Duke ngarkuar...</div> : null}
        {error ? <div style={{ color: "#ffb4b4" }}>{error}</div> : null}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr>
                <Th>Detyra</Th><Th>Tipi</Th><Th>Statusi</Th><Th>Produkti</Th><Th>Nga</Th><Th>Ne</Th><Th>Sasia</Th><Th>Referenca</Th><Th>Nisur</Th><Th>Perfunduar</Th><Th>Kohe (sek)</Th><Th>Veprime</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>{x.taskNo}</Td>
                  <Td>{sqType[x.type]}</Td>
                  <Td>{sqStatus[x.status]}</Td>
                  <Td>{x.productSku ?? "-"} {x.productName ? `- ${x.productName}` : ""}</Td>
                  <Td>{x.fromBinCode ?? "-"}</Td>
                  <Td>{x.toBinCode ?? "-"}</Td>
                  <Td>{fmtNumber(x.quantity)}</Td>
                  <Td>{x.reference ?? "-"}</Td>
                  <Td>{fmtDate(x.startedAt)}</Td>
                  <Td>{fmtDate(x.completedAt)}</Td>
                  <Td>{fmtNumber(x.leadTimeSeconds)}</Td>
                  <Td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {x.status === "Open" ? <button onClick={() => runAction(() => startWarehouseTask(x.id))}>Nis</button> : null}
                      {x.status === "Blocked" ? <button onClick={() => runAction(() => startWarehouseTask(x.id))}>Rifillo</button> : null}
                      {x.status !== "Done" && x.status !== "Cancelled" && x.status !== "Blocked" ? <button onClick={() => runAction(() => completeWarehouseTask(x.id))}>Perfundo</button> : null}
                      {x.status !== "Done" && x.status !== "Cancelled" ? <button onClick={() => void requestHelp(x)}>{hasActiveHelp(x) ? "Ndihma aktive" : "Kerko ndihme"}</button> : null}
                      {hasActiveHelp(x) ? <button onClick={() => runAction(() => resolveWarehouseTaskHelp(x.id))}>U ndihmua</button> : null}
                      {x.status !== "Done" && x.status !== "Cancelled" ? <button onClick={() => void reportProblem(x)}>Ka problem</button> : null}
                      {x.status !== "Done" && x.status !== "Cancelled" ? <button onClick={() => runAction(() => cancelWarehouseTask(x.id))}>Anulo</button> : null}
                    </div>
                  </Td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr><Td colSpan={12}>Nuk ka veprime, task.</Td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {total > 0 ? `Duke shfaqur ${items.length} nga ${total} i veprimeve` : "Nuk ka te dhena"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10 / faqe</option>
              <option value={20}>20 / faqe</option>
              <option value={50}>50 / faqe</option>
            </select>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Mbrapa</button>
            <span style={{ minWidth: 90, textAlign: "center" }}>Faqja {page} / {totalPages}</span>
            <button onClick={() => setPage((p) => (p < totalPages ? p + 1 : p))} disabled={page >= totalPages}>Para</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkList({
  title,
  empty,
  items,
  action,
}: {
  title: string;
  empty: string;
  items: WarehouseTaskDto[];
  action: (task: WarehouseTaskDto) => React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {items.length ? (
        items.map((task) => (
          <div
            key={task.id}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "var(--panel-soft)",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>{task.taskNo}</div>
                <div style={{ fontSize: 18, fontWeight: 900, marginTop: 3 }}>{sqType[task.type]}</div>
                <div style={{ color: "var(--muted-strong)", fontSize: 13, marginTop: 5 }}>
                  {task.productSku ? `${task.productSku} - ${task.productName ?? ""}` : "Pa produkt"}
                </div>
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(96,165,250,0.34)",
                  background: "rgba(30,64,175,0.20)",
                  color: "#bfdbfe",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {sqStatus[task.status]}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {task.quantity ? <SmallInfo label="Sasia" value={fmtNumber(task.quantity)} /> : null}
              {task.fromBinCode ? <SmallInfo label="Nga" value={task.fromBinCode} /> : null}
              {task.toBinCode ? <SmallInfo label="Ne" value={task.toBinCode} /> : null}
              {task.reference ? <SmallInfo label="Dokumenti" value={task.reference} /> : null}
            </div>

            {task.status === "Blocked" && task.note ? (
              <div
                style={{
                  border: "1px solid rgba(251,191,36,0.30)",
                  background: "rgba(120,53,15,0.18)",
                  color: "#fde68a",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Arsyeja: {task.note}
              </div>
            ) : null}

            {hasActiveHelp(task) ? (
              <div
                style={{
                  border: "1px solid rgba(56,189,248,0.30)",
                  background: "rgba(12,74,110,0.18)",
                  color: "#bae6fd",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Kerkuar ndihme: {task.helpRequestNote || "Pa shenim."}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{action(task)}</div>
          </div>
        ))
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, color: "var(--muted)", background: "var(--panel-soft)" }}>
          {empty}
        </div>
      )}
    </div>
  );
}

function HelpList({
  items,
  onResolve,
  onRestart,
}: {
  items: WarehouseTaskDto[];
  onResolve: (task: WarehouseTaskDto) => void;
  onRestart: (task: WarehouseTaskDto) => void;
}) {
  if (!items.length) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, color: "var(--muted)", background: "var(--panel-soft)" }}>
        Nuk ka kerkesa per ndihme per momentin.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 10 }}>
      {items.map((task) => (
        <div
          key={task.id}
          style={{
            border: "1px solid rgba(56,189,248,0.24)",
            borderRadius: 14,
            padding: 12,
            background: "rgba(15,23,42,0.60)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#7dd3fc", fontSize: 12, fontWeight: 900 }}>{task.taskNo}</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 3 }}>{sqType[task.type]}</div>
              <div style={{ color: "var(--muted-strong)", fontSize: 13, marginTop: 5 }}>
                {task.productSku ? `${task.productSku} - ${task.productName ?? ""}` : "Pa produkt"}
              </div>
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(56,189,248,0.34)",
                background: "rgba(12,74,110,0.24)",
                color: "#bae6fd",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Pret ndihme
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {task.quantity ? <SmallInfo label="Sasia" value={fmtNumber(task.quantity)} /> : null}
            {task.fromBinCode ? <SmallInfo label="Nga" value={task.fromBinCode} /> : null}
            {task.toBinCode ? <SmallInfo label="Ne" value={task.toBinCode} /> : null}
            {task.reference ? <SmallInfo label="Dokumenti" value={task.reference} /> : null}
            <SmallInfo label="Punetori" value={task.assignedToUsername || "Pa punetor"} />
            <SmallInfo label="Kerkuar" value={fmtDate(task.helpRequestedAt)} />
          </div>

          <div
            style={{
              border: "1px solid rgba(56,189,248,0.30)",
              background: "rgba(12,74,110,0.18)",
              color: "#bae6fd",
              borderRadius: 10,
              padding: 10,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Kerkesa: {task.helpRequestNote || "Pa shenim."}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {task.status === "Blocked" ? <button onClick={() => onRestart(task)}>Rifillo punen</button> : null}
            <button onClick={() => onResolve(task)}>U ndihmua</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProblemList({
  items,
  onRestart,
  onAssign,
  canAssign,
}: {
  items: WarehouseTaskDto[];
  onRestart: (task: WarehouseTaskDto) => void;
  onAssign: (task: WarehouseTaskDto) => void;
  canAssign: boolean;
}) {
  if (!items.length) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, color: "var(--muted)", background: "var(--panel-soft)" }}>
        Nuk ka pune me problem per momentin.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 10 }}>
      {items.map((task) => (
        <div
          key={task.id}
          style={{
            border: "1px solid rgba(251,191,36,0.24)",
            borderRadius: 14,
            padding: 12,
            background: "rgba(15,23,42,0.60)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#fcd34d", fontSize: 12, fontWeight: 900 }}>{task.taskNo}</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 3 }}>{sqType[task.type]}</div>
              <div style={{ color: "var(--muted-strong)", fontSize: 13, marginTop: 5 }}>
                {task.productSku ? `${task.productSku} - ${task.productName ?? ""}` : "Pa produkt"}
              </div>
            </div>
            <div
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(251,191,36,0.34)",
                background: "rgba(120,53,15,0.24)",
                color: "#fde68a",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              Ka problem
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            {task.quantity ? <SmallInfo label="Sasia" value={fmtNumber(task.quantity)} /> : null}
            {task.fromBinCode ? <SmallInfo label="Nga" value={task.fromBinCode} /> : null}
            {task.toBinCode ? <SmallInfo label="Ne" value={task.toBinCode} /> : null}
            {task.reference ? <SmallInfo label="Dokumenti" value={task.reference} /> : null}
            <SmallInfo label="Punetori" value={task.assignedToUsername || "Pa punetor"} />
            <SmallInfo label="Raportuar" value={fmtDate(task.updatedAt ?? task.createdAt)} />
          </div>

          <div
            style={{
              border: "1px solid rgba(251,191,36,0.30)",
              background: "rgba(120,53,15,0.18)",
              color: "#fde68a",
              borderRadius: 10,
              padding: 10,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Arsyeja: {extractProblemReason(task.note)}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!task.assignedToUserId ? (
              <button disabled={!canAssign} onClick={() => onAssign(task)}>Merre per zgjidhje</button>
            ) : null}
            <button onClick={() => onRestart(task)}>Rifillo punen</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function extractProblemReason(note?: string | null) {
  if (!note?.trim()) return "Nuk eshte shkruar arsye.";
  const parts = note.split("|").map((x) => x.trim()).filter(Boolean);
  const latestProblem = [...parts].reverse().find((x) => x.toLowerCase().startsWith("problem"));
  return latestProblem ?? parts[parts.length - 1] ?? note;
}

function hasActiveHelp(task: WarehouseTaskDto) {
  return Boolean(task.helpRequestedAt && !task.helpResolvedAt);
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 9, borderRadius: 10, border: "1px solid rgba(255,255,255,0.055)", background: "rgba(255,255,255,0.035)" }}>
      <div style={{ color: "var(--muted)", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 3, fontWeight: 800, overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function AutoList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", top: 44, left: 0, right: 0, zIndex: 6, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-strong)", maxHeight: 220, overflowY: "auto" }}>
      {children}
    </div>
  );
}

function AutoItem({ children, onPick }: { children: React.ReactNode; onPick: () => void }) {
  return (
    <button
      type="button"
      style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", padding: "8px 10px", color: "var(--text)" }}
      onMouseDown={onPick}
    >
      {children}
    </button>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--panel-soft)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 10, fontSize: 12, color: "var(--muted)" }}>{children}</th>;
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ padding: 10, verticalAlign: "top" }}>{children}</td>;
}
