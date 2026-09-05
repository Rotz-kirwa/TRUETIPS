import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, XCircle, Eye, EyeOff, Pencil, Check, X, Loader2, Copy, CopyCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { z } from "zod";
import { cn } from "@/lib/utils";

// ─── Default production fallbacks ─────────────────────────────────────────────

const DEFAULT_ENVS: Record<string, string> = {
  DATABASE_URL: "postgresql://truetips_db_user:xNiZ9q0LdMkE2seXw5BKwkIg4Gv9NV6R@dpg-dacie4uq1p3s738a02ng-a.oregon-postgres.render.com/truetips_db",
  JWT_SECRET: "paylix-super-secret-jwt-key-2026-secure",
  MPESA_CONSUMER_KEY: "OWzibbuoj9it15pJLqY3RLuriXxthJVYUU4MmVgnohMg6nRG",
  MPESA_CONSUMER_SECRET: "vULjb5gAFfAsxEmtMnFVMpl5H6wj66yVj6cXFh02SAv4MNCApqvUDYNGa3cXrRQd",
  MPESA_SHORTCODE: "4980406",
  MPESA_TILL_NUMBER: "232392",
  MPESA_PASSKEY: "cb69fb59b02bbb0ab518f7de1c1b91645ce7408201096b6ddc169057d56d824b",
  MPESA_CALLBACK_URL: "https://moonlight-games.onrender.com",
  MPESA_ENVIRONMENT: "production",
  SMS_PROVIDER: "onfon",
  ONFON_API_KEY: "2rYG3PR90oQzwMH4abIm18pTKUvxJkcfZiA67FuBShqgsE5X",
  ONFON_CLIENT_ID: "nebula",
  ONFON_SENDER_ID: "NEBULA",
};

function getEnv(key: string): string | null {
  const val = process.env[key]?.trim();
  if (val) return val;
  return DEFAULT_ENVS[key] ?? null;
}

// ─── Server functions ────────────────────────────────────────────────────────

const checkCredentialsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();

  const callbackUrl = getEnv("MPESA_CALLBACK_URL");
  const c2bConfirmationUrl = callbackUrl
    ? new URL("/api/payments/c2b/confirmation", callbackUrl).toString()
    : null;
  const c2bValidationUrl = callbackUrl
    ? new URL("/api/payments/c2b/validation", callbackUrl).toString()
    : null;

  return {
    databaseUrl: !!getEnv("DATABASE_URL"),
    jwtSecret: !!getEnv("JWT_SECRET"),
    mpesaConsumerKey: !!getEnv("MPESA_CONSUMER_KEY"),
    mpesaConsumerSecret: !!getEnv("MPESA_CONSUMER_SECRET"),
    mpesaShortcode: !!getEnv("MPESA_SHORTCODE"),
    mpesaTillNumber: !!getEnv("MPESA_TILL_NUMBER"),
    mpesaPasskey: !!getEnv("MPESA_PASSKEY"),
    mpesaCallbackUrl: callbackUrl,
    c2bConfirmationUrl,
    c2bValidationUrl,
    mpesaEnvironment: getEnv("MPESA_ENVIRONMENT") ?? "production",
    smsProvider: getEnv("SMS_PROVIDER"),
    onfonApiKey: !!getEnv("ONFON_API_KEY"),
    onfonClientId: !!getEnv("ONFON_CLIENT_ID"),
    onfonSenderId: !!getEnv("ONFON_SENDER_ID"),
  };
});

const ALLOWED_KEYS = [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_TILL_NUMBER",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
  "ONFON_API_KEY",
  "ONFON_CLIENT_ID",
  "ONFON_SENDER_ID",
  "DATABASE_URL",
  "JWT_SECRET",
] as const;

type CredKey = (typeof ALLOWED_KEYS)[number];

/** Returns masked value for display. */
function maskValue(val: string): string {
  if (val.length <= 8) return "•".repeat(val.length);
  return val.slice(0, 4) + "•".repeat(Math.min(val.length - 8, 24)) + val.slice(-4);
}

const getMaskedCredentialsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  await requireCurrentUser();

  return {
    MPESA_CONSUMER_KEY: getEnv("MPESA_CONSUMER_KEY") ? maskValue(getEnv("MPESA_CONSUMER_KEY")!) : null,
    MPESA_CONSUMER_SECRET: getEnv("MPESA_CONSUMER_SECRET") ? maskValue(getEnv("MPESA_CONSUMER_SECRET")!) : null,
    MPESA_SHORTCODE: getEnv("MPESA_SHORTCODE"),
    MPESA_TILL_NUMBER: getEnv("MPESA_TILL_NUMBER"),
    MPESA_PASSKEY: getEnv("MPESA_PASSKEY") ? maskValue(getEnv("MPESA_PASSKEY")!) : null,
    MPESA_CALLBACK_URL: getEnv("MPESA_CALLBACK_URL"),
    ONFON_API_KEY: getEnv("ONFON_API_KEY") ? maskValue(getEnv("ONFON_API_KEY")!) : null,
    ONFON_CLIENT_ID: getEnv("ONFON_CLIENT_ID") ? maskValue(getEnv("ONFON_CLIENT_ID")!) : null,
    ONFON_SENDER_ID: getEnv("ONFON_SENDER_ID"),
    DATABASE_URL: getEnv("DATABASE_URL") ? maskValue(getEnv("DATABASE_URL")!) : null,
    JWT_SECRET: getEnv("JWT_SECRET") ? maskValue(getEnv("JWT_SECRET")!) : null,
  };
});

const revealCredentialFn = createServerFn({ method: "POST" })
  .inputValidator((key: unknown) => z.enum(ALLOWED_KEYS).parse(key))
  .handler(async ({ data: key }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();
    return { value: getEnv(key) };
  });

const EDITABLE_KEYS: CredKey[] = [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_TILL_NUMBER",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_URL",
  "ONFON_API_KEY",
  "ONFON_CLIENT_ID",
  "ONFON_SENDER_ID",
];

const updateCredentialFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ key: z.enum(ALLOWED_KEYS), value: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("../lib/auth.server");
    await requireCurrentUser();

    if (!EDITABLE_KEYS.includes(data.key as CredKey)) {
      throw new Error(`${data.key} cannot be edited from the dashboard.`);
    }

    // Update the running process immediately (works on read-only filesystems too)
    process.env[data.key] = data.value;

    // Best-effort persist to .env file — silently skip on read-only fs (e.g. Render)
    try {
      const fs = await import("fs");
      const path = await import("path");
      const envPath = path.resolve(process.cwd(), ".env");
      let content = "";
      try { content = fs.readFileSync(envPath, "utf8"); } catch { content = ""; }
      const regex = new RegExp(`^${data.key}=.*$`, "m");
      const line = `${data.key}=${data.value}`;
      content = regex.test(content)
        ? content.replace(regex, line)
        : content.trimEnd() + `\n${line}\n`;
      fs.writeFileSync(envPath, content, "utf8");
    } catch { /* read-only filesystem — process.env already updated above */ }

    return { success: true };
  });

const registerC2bUrlsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireCurrentUser } = await import("../lib/auth.server");
  const { registerC2bUrls } = await import("../lib/mpesa.server");
  await requireCurrentUser();
  const { shortCode, confirmationUrl, validationUrl, alreadyRegistered } = await registerC2bUrls();
  return { shortCode, confirmationUrl, validationUrl, alreadyRegistered };
});

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4">
      <div className="space-y-2 border-b pb-4 border-white/10">
        <div className="h-8 w-48 bg-emerald-500/20 rounded-xl" />
        <div className="h-4 w-72 bg-emerald-500/10 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-48 rounded-2xl bg-white/5 border border-white/10" />
        <div className="h-48 rounded-2xl bg-white/5 border border-white/10" />
      </div>
      <div className="h-96 rounded-2xl bg-white/5 border border-white/10" />
    </div>
  );
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_app/settings")({
  loader: () =>
    Promise.all([checkCredentialsFn(), getMaskedCredentialsFn()]).then(([flags, masked]) => ({
      flags,
      masked,
    })),
  pendingComponent: SettingsSkeleton,
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — TrueTips Admin" }] }),
});

// ─── Credential row component ────────────────────────────────────────────────

function CredentialRow({
  label,
  credKey,
  maskedValue,
  isSet,
  editable,
  onSaved,
}: {
  label: string;
  credKey: CredKey;
  maskedValue: string | null;
  isSet: boolean;
  editable: boolean;
  onSaved: (key: CredKey, newMasked: string) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [copied, setCopied] = useState(false);

  const displayVal = revealed ?? maskedValue ?? "—";
  const showEye = isSet;

  async function handleReveal() {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealing(true);
    try {
      const { value } = await revealCredentialFn({ data: credKey });
      setRevealed(value ?? "");
    } catch {
      /* silently ignore */
    } finally {
      setRevealing(false);
    }
  }

  async function startEdit() {
    // Reveal current value first so input is pre-filled
    let current = revealed;
    if (!current && isSet) {
      setRevealing(true);
      try {
        const { value } = await revealCredentialFn({ data: credKey });
        current = value ?? "";
        setRevealed(current);
      } finally {
        setRevealing(false);
      }
    }
    setEditVal(current ?? "");
    setSaveErr("");
    setEditing(true);
  }

  async function handleSave() {
    if (!editVal.trim()) return;
    setSaving(true);
    setSaveErr("");
    try {
      await updateCredentialFn({ data: { key: credKey, value: editVal.trim() } });
      const newMasked = maskValue(editVal.trim());
      setRevealed(editVal.trim());
      onSaved(credKey, newMasked);
      setEditing(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    const val: string =
      revealed ?? (await revealCredentialFn({ data: credKey }).then((r) => r.value ?? ""));
    await navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {/* Status dot */}
        <span className="shrink-0">
          {isSet ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
        </span>

        {/* Label */}
        <span className="text-sm font-medium w-64 shrink-0">{label}</span>

        {/* Value */}
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
            <input
              autoFocus
              type="text"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
              className="flex-1 min-w-0 h-8 rounded-lg border border-primary bg-background px-3 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Enter new value…"
            />
            <button
              onClick={handleSave}
              disabled={saving || !editVal.trim()}
              className="flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--gradient-primary)" }}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setSaveErr(""); }}
              className="flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium hover:bg-secondary"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            {saveErr && <span className="w-full text-xs text-destructive">{saveErr}</span>}
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <code
              className={cn(
                "flex-1 min-w-0 truncate rounded-md px-2.5 py-1 font-mono text-xs",
                isSet ? "bg-secondary text-foreground" : "bg-secondary/50 text-muted-foreground italic",
              )}
            >
              {isSet ? displayVal : "not set"}
            </code>

            {/* Action icons */}
            <div className="flex shrink-0 items-center gap-1">
              {showEye && (
                <button
                  onClick={handleReveal}
                  disabled={revealing}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                  title={revealed ? "Hide value" : "Reveal value"}
                >
                  {revealing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : revealed ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {showEye && (
                <button
                  onClick={handleCopy}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  title="Copy value"
                >
                  {copied ? (
                    <CopyCheck className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              {editable && (
                <button
                  onClick={startEdit}
                  disabled={revealing}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary transition-colors disabled:opacity-50"
                  title="Edit value"
                >
                  {revealing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function SettingsPage() {
  const { email } = useAuth();
  const loaderData = Route.useLoaderData();
  const { flags } = loaderData;
  const [masked, setMasked] = useState(loaderData.masked);
  const [registering, setRegistering] = useState(false);
  const [regMsg, setRegMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mpesaReady =
    flags.mpesaConsumerKey &&
    flags.mpesaConsumerSecret &&
    flags.mpesaShortcode &&
    !!flags.mpesaCallbackUrl;

  function handleSaved(key: CredKey, newMasked: string) {
    setMasked((prev) => ({ ...prev, [key]: newMasked }));
  }

  async function handleRegister() {
    setRegistering(true);
    setRegMsg(null);
    try {
      const r = await registerC2bUrlsFn();
      setRegMsg({
        ok: true,
        text: r.alreadyRegistered
          ? `C2B URLs are already registered for ${r.shortCode}.`
          : `C2B URLs registered for ${r.shortCode}. Direct till payments will now be recorded.`,
      });
    } catch (e) {
      setRegMsg({ ok: false, text: e instanceof Error ? e.message : "Registration failed" });
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your workspace and integration settings.</p>
      </header>

      {/* Account */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <h2 className="text-base font-semibold">Account</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Email" value={email ?? ""} />
          <Field label="Role" value="Administrator" />
          <Field label="Workspace" value="TRUETIPS HQ" />
          <Field label="Currency" value="KES (Kenyan Shilling)" />
        </div>
      </section>

      {/* M-Pesa Integration */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">M-Pesa Integration</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              mpesaReady ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            {mpesaReady ? `Active · ${flags.mpesaEnvironment}` : "Not configured"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Safaricom Daraja — Till {masked.MPESA_TILL_NUMBER ?? "232392"} · customers pay directly to the till and transactions are recorded automatically.
        </p>

        <p className="mt-5 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Credentials
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] normal-case tracking-normal font-normal text-muted-foreground">
            click <Eye className="inline h-3 w-3 mx-0.5" /> to reveal · <Pencil className="inline h-3 w-3 mx-0.5" /> to edit
          </span>
        </p>

        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <CredentialRow
            label="MPESA_CONSUMER_KEY"
            credKey="MPESA_CONSUMER_KEY"
            maskedValue={masked.MPESA_CONSUMER_KEY}
            isSet={flags.mpesaConsumerKey}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="MPESA_CONSUMER_SECRET"
            credKey="MPESA_CONSUMER_SECRET"
            maskedValue={masked.MPESA_CONSUMER_SECRET}
            isSet={flags.mpesaConsumerSecret}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="MPESA_SHORTCODE"
            credKey="MPESA_SHORTCODE"
            maskedValue={masked.MPESA_SHORTCODE}
            isSet={flags.mpesaShortcode}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="MPESA_TILL_NUMBER"
            credKey="MPESA_TILL_NUMBER"
            maskedValue={masked.MPESA_TILL_NUMBER}
            isSet={flags.mpesaTillNumber}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="MPESA_PASSKEY"
            credKey="MPESA_PASSKEY"
            maskedValue={masked.MPESA_PASSKEY}
            isSet={flags.mpesaPasskey}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="MPESA_CALLBACK_URL"
            credKey="MPESA_CALLBACK_URL"
            maskedValue={masked.MPESA_CALLBACK_URL}
            isSet={!!flags.mpesaCallbackUrl}
            editable
            onSaved={handleSaved}
          />
        </div>

        {/* Webhook URLs */}
        <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4 space-y-3 text-xs">
          <p className="font-semibold text-sm">Webhook URLs</p>
          <p className="text-muted-foreground -mt-1">These must be publicly accessible for Safaricom to reach them.</p>
          <UrlRow label="C2B confirmation" value={flags.c2bConfirmationUrl} />
          <UrlRow label="C2B validation" value={flags.c2bValidationUrl} />
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={handleRegister}
              disabled={registering || !mpesaReady}
              style={{ background: "var(--gradient-primary)" }}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {registering && <Loader2 className="h-3 w-3 animate-spin" />}
              {registering ? "Registering…" : "Register Direct Till URLs"}
            </button>
            {regMsg && (
              <p className={`text-xs ${regMsg.ok ? "text-success" : "text-destructive"}`}>
                {regMsg.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* SMS Provider */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">SMS Provider</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              flags.onfonApiKey
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning"
            }`}
          >
            {flags.smsProvider ? `${flags.smsProvider}` : "not configured"}
            {flags.onfonApiKey ? " · Active" : " · Key missing"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Onfon Media — SMS messages sent to customers after successful till payments.
        </p>

        <p className="mt-5 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Credentials
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] normal-case tracking-normal font-normal text-muted-foreground">
            click <Eye className="inline h-3 w-3 mx-0.5" /> to reveal · <Pencil className="inline h-3 w-3 mx-0.5" /> to edit
          </span>
        </p>

        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <CredentialRow
            label="ONFON_API_KEY"
            credKey="ONFON_API_KEY"
            maskedValue={masked.ONFON_API_KEY}
            isSet={flags.onfonApiKey}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="ONFON_CLIENT_ID"
            credKey="ONFON_CLIENT_ID"
            maskedValue={masked.ONFON_CLIENT_ID}
            isSet={flags.onfonClientId}
            editable
            onSaved={handleSaved}
          />
          <CredentialRow
            label="ONFON_SENDER_ID"
            credKey="ONFON_SENDER_ID"
            maskedValue={masked.ONFON_SENDER_ID}
            isSet={flags.onfonSenderId}
            editable
            onSaved={handleSaved}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Set <code className="rounded bg-secondary px-1">SMS_PROVIDER=onfon</code> in your environment to activate.
          Messages are sent automatically after every successful C2B payment.
        </p>
      </section>

      {/* Database */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 text-base font-semibold">Database</h2>
        <div className="divide-y divide-border rounded-xl border border-border px-4">
          <CredentialRow
            label="DATABASE_URL"
            credKey="DATABASE_URL"
            maskedValue={masked.DATABASE_URL}
            isSet={flags.databaseUrl}
            editable={false}
            onSaved={handleSaved}
          />
          <CredentialRow
            label="JWT_SECRET"
            credKey="JWT_SECRET"
            maskedValue={masked.JWT_SECRET}
            isSet={flags.jwtSecret}
            editable={false}
            onSaved={handleSaved}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          DATABASE_URL and JWT_SECRET are infrastructure credentials — update them in your hosting environment or <code className="rounded bg-secondary px-1">.env</code> file directly.
        </p>
      </section>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function UrlRow({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{label}</p>
        <p className="font-mono text-muted-foreground break-all mt-0.5">{value ?? "—"}</p>
      </div>
      {value && (
        <button
          onClick={copy}
          className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Copy URL"
        >
          {copied ? <CopyCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
