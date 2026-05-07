import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getSessionUser, roleLabel } from "../../shared/session";
import { canViewAudit } from "../../shared/permissions";
import { clearToken } from "../../services/token";

const navItems = [
  { to: "/", label: "Paneli kryesor", end: true },
  { to: "/documents/new", label: "Dokument i ri" },
  { to: "/inbound", label: "Pranimet" },
  { to: "/outbound", label: "Daljet" },
  { to: "/purchase-orders", label: "Porosite e blerjes" },
  { to: "/sales-orders", label: "Porosite e shitjes" },
  { to: "/returns", label: "Kthimet" },
  { to: "/inventory", label: "Inventari" },
  { to: "/cycle-counts", label: "Numerimi i inventarit" },
  { to: "/labels", label: "Etiketat" },
  { to: "/stock-movements", label: "Levizjet e stokut" },
  { to: "/products", label: "Produktet" },
  { to: "/customers", label: "Klientet" },
  { to: "/suppliers", label: "Furnizuesit" },
  { to: "/finance", label: "Pagesat dhe borxhet" },
];

type ThemeMode = "dark" | "light";

function roleLabelSq(role?: number) {
  const fromSession = roleLabel(role as 0 | 1 | 2 | 3 | undefined);
  if (fromSession && !fromSession.includes("�")) return fromSession;
  if (role === 0) return "Admin";
  if (role === 1) return "Punetor";
  if (role === 2) return "Mbikeqyres";
  if (role === 3) return "Menaxher";
  return "E panjohur";
}

const shellLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: "block",
  padding: "10px 12px",
  borderRadius: 12,
  textDecoration: "none",
  color: isActive ? "var(--text)" : "var(--muted-strong)",
  background: isActive
    ? "linear-gradient(135deg, rgba(110,231,200,0.18), rgba(64,156,255,0.18))"
    : "rgba(255,255,255,0.03)",
  border: isActive ? "1px solid rgba(110,231,200,0.24)" : "1px solid rgba(255,255,255,0.04)",
  boxShadow: isActive ? "0 12px 28px rgba(0,0,0,0.18)" : "none",
  transition: "transform 140ms ease, background 140ms ease, border 140ms ease",
});

export default function AppLayout() {
  const nav = useNavigate();
  const me = getSessionUser();
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [compact, setCompact] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 1100 : false
  );
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 1100) return false;
    return localStorage.getItem("smd_sidebar_open") !== "false";
  });

  useEffect(() => {
    const saved = localStorage.getItem("smd_theme");
    const nextTheme: ThemeMode = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const nextCompact = window.innerWidth < 1100;
      setCompact(nextCompact);
      setSidebarOpen(() => {
        if (nextCompact) return false;
        const saved = localStorage.getItem("smd_sidebar_open");
        return saved === null ? true : saved !== "false";
      });
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("smd_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }

  function toggleSidebar() {
    setSidebarOpen((current) => {
      const next = !current;
      if (!compact) {
        localStorage.setItem("smd_sidebar_open", String(next));
      }
      return next;
    });
  }

  function closeSidebarOnCompact() {
    if (compact) setSidebarOpen(false);
  }

  function onLogout() {
    clearToken();
    nav("/login", { replace: true });
    window.location.reload();
  }

  return (
    <div
      className="app-shell"
      style={{
        display: "grid",
        gridTemplateColumns: compact || !sidebarOpen ? "minmax(0, 1fr)" : "clamp(240px, 17vw, 280px) minmax(0, 1fr)",
        minHeight: "100vh",
      }}
    >
      {compact && sidebarOpen ? (
        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            padding: 0,
            border: 0,
            borderRadius: 0,
            background: "rgba(2, 8, 23, 0.58)",
            boxShadow: "none",
            cursor: "default",
            transform: "none",
          }}
        />
      ) : null}

      <aside
        className="app-sidebar"
        style={{
          position: compact ? "fixed" : "sticky",
          zIndex: compact ? 40 : 1,
          top: 0,
          left: 0,
          width: compact ? "min(86vw, 320px)" : "auto",
          transform: compact && !sidebarOpen ? "translateX(-105%)" : "translateX(0)",
          pointerEvents: compact && !sidebarOpen ? "none" : "auto",
          height: "100vh",
          padding: compact ? 16 : 18,
          display: sidebarOpen || compact ? "flex" : "none",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 94%, transparent) 0%, color-mix(in srgb, var(--bg-elevated) 96%, transparent) 100%)",
          borderRight: "1px solid var(--border)",
          boxShadow: "inset -1px 0 0 rgba(255,255,255,0.03)",
          backdropFilter: "blur(18px)",
          transition: "transform 180ms ease",
        }}
      >
        <div
          style={{
            padding: 16,
            borderRadius: 18,
            background:
              "radial-gradient(circle at top right, rgba(110,231,200,0.22), transparent 46%), linear-gradient(135deg, color-mix(in srgb, var(--panel-strong) 98%, transparent), color-mix(in srgb, var(--panel) 96%, transparent))",
            border: "1px solid var(--border)",
            boxShadow: "0 22px 48px rgba(0,0,0,0.24)",
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)" }}>
            Sistemi SMD
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.14, marginTop: 6 }}>Sistemi i Menaxhimit te Depove</div>
          <div style={{ color: "var(--muted-strong)", marginTop: 8, fontSize: 13 }}>
            Platforme e qarte per pranime, dalje, inventar dhe levizje te stokut ne depo.
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 16,
            background: "var(--panel-soft)",
            border: "1px solid var(--border)",
            boxShadow: "0 12px 26px rgba(0,0,0,0.16)",
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
            Përdoruesi aktiv
          </div>

          <div style={{ fontWeight: 800, marginTop: 8, fontSize: 16, wordBreak: "break-word" }}>
            {me?.email ?? "—"}
          </div>

          <div style={{ fontSize: 13, color: "var(--muted-strong)", marginTop: 6 }}>
            Roli: <b style={{ color: "var(--text)" }}>{roleLabelSq(me?.role)}</b>
          </div>

          <button
            onClick={onLogout}
            style={{
              marginTop: 14,
              width: "100%",
              borderRadius: 12,
              border: "1px solid rgba(245,127,127,0.22)",
              background: "rgba(245,127,127,0.10)",
              color: "#ffd2d2",
            }}
          >
            Dil nga sistemi
          </button>
        </div>

        <nav style={{ display: "grid", gap: 8 }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} style={shellLinkStyle} end={item.end} onClick={closeSidebarOnCompact}>
              {item.label}
            </NavLink>
          ))}

          {canViewAudit(me?.role) ? (
            <NavLink to="/audit-logs" style={shellLinkStyle} onClick={closeSidebarOnCompact}>
              Regjistri i auditimit
            </NavLink>
          ) : null}
        </nav>

        <button
          type="button"
          onClick={toggleTheme}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)",
            color: "var(--text)",
          }}
        >
          {theme === "dark" ? "Kalo ne pamje te hapur" : "Kalo ne pamje te erret"}
        </button>

        <div
          style={{
            marginTop: "auto",
            padding: 14,
            borderRadius: 16,
            background: "var(--panel-soft)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
            fontSize: 13,
          }}
        >
          <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 6 }}>Fokusi i dites</div>
          Kontrollo dokumentet draft, levizjet e fundit dhe disponueshmerine e stokut para konfirmimeve.
        </div>
      </aside>

      <main
        style={{
          minWidth: 0,
          width: "100%",
          color: "var(--text)",
          background: "transparent",
          overflowX: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1680,
            margin: 0,
            padding: compact ? "18px 12px 28px" : "24px clamp(20px, 2vw, 36px) 40px",
          }}
        >
          <div
            className="app-shell-controls"
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <button
              type="button"
              aria-label={sidebarOpen ? "Mbyll menun" : "Hap menun"}
              title={sidebarOpen ? "Mbyll menun" : "Hap menun"}
              onClick={toggleSidebar}
              style={{
                position: compact && sidebarOpen ? "fixed" : "relative",
                top: compact && sidebarOpen ? 16 : undefined,
                left: compact && sidebarOpen ? 16 : undefined,
                zIndex: compact && sidebarOpen ? 50 : 1,
                width: 44,
                height: 40,
                padding: 0,
                display: "inline-grid",
                placeItems: "center",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--panel-strong) 86%, transparent)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "grid",
                  gap: 4,
                  width: 18,
                }}
              >
                <span style={{ height: 2, borderRadius: 999, background: "currentColor" }} />
                <span style={{ height: 2, borderRadius: 999, background: "currentColor" }} />
                <span style={{ height: 2, borderRadius: 999, background: "currentColor" }} />
              </span>
            </button>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
