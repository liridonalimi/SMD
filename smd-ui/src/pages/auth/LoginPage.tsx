import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../../services/auth";
import { getToken } from "../../services/token";
import { SurfaceCard } from "../../shared/ui/SurfaceCard";
import { FieldLabel } from "../../shared/ui/FieldLabel";
import smdBannerLogo from "../../assets/logo/smd-logo-banner-horizontal-transparent.png";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < 980 : false
  );

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 3 && !loading;
  }, [email, password, loading]);

  useEffect(() => {
    if (getToken()) nav("/", { replace: true });
  }, [nav]);

  useEffect(() => {
    const onResize = () => {
      setCompact(window.innerWidth < 980);
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      await login({ email: email.trim(), password });
      nav("/", { replace: true });
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : "Hyrja deshtoi.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: compact ? "minmax(0, 1fr)" : "1.05fr 0.95fr",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--panel-strong) 92%, transparent), color-mix(in srgb, var(--bg) 100%, transparent))",
      }}
    >
      <section
        style={{
          padding: compact ? "28px 18px 12px" : "56px 54px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
        }}
      >
        <img
          src={smdBannerLogo}
          alt="SMD - Sistemi i Menaxhimit te Depove"
          style={{
            width: compact ? "min(100%, 430px)" : 560,
            maxWidth: "100%",
            height: "auto",
            objectFit: "contain",
            alignSelf: "flex-start",
          }}
        />

        <div style={{ maxWidth: 560 }}>
          <h1 style={{ fontSize: 52, lineHeight: 0.98, marginBottom: 14 }}>
            Sistemi i Menaxhimit te Depove
          </h1>
          <div style={{ color: "var(--muted-strong)", fontSize: 18, maxWidth: 520 }}>
            Platforme e qarte per menaxhimin e pranimeve, daljeve, inventarit dhe levizjeve te
            stokut ne depo.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: compact ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))",
            gap: 14,
            maxWidth: 620,
          }}
        >
          {[
            { title: "Pranime", desc: "Regjistro hyrjet e mallrave dhe vendosjen ne shporta." },
            { title: "Dalje", desc: "Kontrollo dokumentet dalese dhe levizjet e stokut." },
            { title: "Inventar", desc: "Shiko gjendjen aktuale, rezervimet dhe mungesat." },
          ].map((item) => (
            <SurfaceCard
              key={item.title}
              style={{
                padding: 16,
                background: "var(--panel-soft)",
                boxShadow: "none",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "var(--muted-strong)" }}>{item.desc}</div>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: compact ? "12px 18px 28px" : 36,
        }}
      >
        <SurfaceCard
          style={{
            width: "100%",
            maxWidth: 460,
            padding: 28,
            borderRadius: 24,
            background: "var(--panel)",
          }}
        >
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                marginBottom: 10,
              }}
            >
              Hyrja ne sistem
            </div>
            <h2 style={{ marginBottom: 8, fontSize: 32 }}>Mire se vini</h2>
            <div style={{ color: "var(--muted-strong)" }}>
              Kycu me email-in dhe fjalekalimin e llogarise suaj per te vazhduar punen ne sistem.
            </div>
          </div>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="p.sh. punetor@smd.local"
                style={{ width: "100%", padding: 12, borderRadius: 12 }}
              />
            </div>

            <div>
              <FieldLabel>Fjalekalimi</FieldLabel>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                type="password"
                placeholder="Shkruaj fjalekalimin"
                style={{ width: "100%", padding: 12, borderRadius: 12 }}
              />
            </div>

            {err ? (
              <div
                style={{
                  color: "tomato",
                  background: "rgba(220, 38, 38, 0.10)",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(220,38,38,0.22)",
                }}
              >
                {err}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                padding: 13,
                borderRadius: 14,
                fontWeight: 700,
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.6,
                background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
                color: "#f8fbff",
                border: "1px solid color-mix(in srgb, var(--accent-strong) 65%, white)",
              }}
            >
              {loading ? "Duke u kycur..." : "Kycu"}
            </button>

            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Mjedis zhvillimi: perdoruesit mund te krijohen nga <code>/api/auth/register</code> ne Swagger.
            </div>
          </form>
        </SurfaceCard>
      </section>
    </div>
  );
}
