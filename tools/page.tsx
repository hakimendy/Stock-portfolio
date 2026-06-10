"use client";
import { useState } from "react";

const fmt = (n: number, d = 2) =>
  (+n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const calcFee = (amount: number) => {
  if (!amount || amount <= 0) return { fee: 0, net: 0, pct: 0, rule: "" };
  if (amount < 2000) return { fee: 20, net: amount - 20, pct: (20 / amount) * 100, rule: "Fixed fee" };
  const fee = amount * 0.004;
  return { fee, net: amount - fee, pct: 0.4, rule: "0.4% rate" };
};

export default function ToolsPage() {
  const [amt, setAmt] = useState("");
  const [currency, setCurrency] = useState("BND");
  const amount = parseFloat(amt) || 0;
  const { fee, net, pct, rule } = calcFee(amount);
  const hasValue = amount > 0;
  const examples = [500, 1500, 2000, 5000, 10000];

  const T = {
    bg: "#07090D", surf: "#0E1117", surf2: "#141820",
    border: "#1C2333", teal: "#00C896", red: "#E5484D",
    amber: "#F59E0B", text: "#F0F4FF", sub: "#8892A4", muted: "#3D4A5C",
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", color: T.text, fontFamily: "-apple-system, sans-serif", padding: "20px 16px" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } input, select { outline: none; font-family: inherit; } input:focus { border-color: #3B82F6 !important; }`}</style>

      {/* Header */}
      <div style={{ maxWidth: 600, margin: "0 auto 24px" }}>
        <a href="/" style={{ color: T.teal, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          &larr; Back to Dashboard
        </a>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>
          Investment Fee Calculator
        </div>
        <div style={{ fontSize: 13, color: T.sub }}>
          Calculate your brokerage fee before you invest
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Input card */}
        <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>

          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", marginBottom: 10 }}>INVESTMENT AMOUNT</div>

          {/* Currency + Amount */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              style={{ background: T.surf2, border: `1px solid ${T.border}`, color: T.text, padding: "12px 10px", borderRadius: 8, fontSize: 13, minWidth: 72, cursor: "pointer" }}
            >
              {["BND", "USD", "SGD", "MYR", "GBP", "EUR"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="number"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              style={{ flex: 1, background: T.surf2, border: `1px solid ${T.border}`, color: T.text, padding: "12px 16px", borderRadius: 8, fontSize: 22, fontFamily: "monospace", fontWeight: 700 }}
            />
          </div>

          {/* Quick select */}
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", marginBottom: 8 }}>QUICK SELECT</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {examples.map(ex => (
              <button
                key={ex}
                onClick={() => setAmt(String(ex))}
                style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${amt === String(ex) ? T.teal : T.border}`, background: amt === String(ex) ? T.teal + "18" : T.surf2, color: amt === String(ex) ? T.teal : T.sub, cursor: "pointer", fontSize: 12, fontFamily: "monospace" }}
              >
                {currency} {ex.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {hasValue && (
          <>
            {/* Rule banner */}
            <div style={{ background: amount < 2000 ? T.amber + "14" : T.teal + "14", border: `1px solid ${amount < 2000 ? T.amber + "40" : T.teal + "40"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{amount < 2000 ? "📌" : "📊"}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: amount < 2000 ? T.amber : T.teal }}>
                  {amount < 2000 ? "Fixed Fee Rule (below BND 2,000)" : "Percentage Fee Rule (BND 2,000 and above)"}
                </div>
                <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{rule} applied</div>
              </div>
            </div>

            {/* 4 result cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Investment",   val: currency + " " + fmt(amount), color: T.text },
                { label: "Fee",          val: currency + " " + fmt(fee),    color: T.red },
                { label: "Net Amount",   val: currency + " " + fmt(net),    color: T.teal },
                { label: "Fee %",        val: fmt((fee / amount) * 100, 3) + "%", color: T.amber },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.1em", marginBottom: 5 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "monospace" }}>{val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Fee schedule */}
        <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 10, color: T.sub, letterSpacing: "0.12em", fontWeight: 600 }}>FEE SCHEDULE</div>
          {[
            ["Below BND 2,000",        "Fixed",      "BND 20.00",  "BND 500 → Fee: BND 20"],
            ["BND 2,000 and above",    "0.4%",       "0.4%",       "BND 5,000 → Fee: BND 20"],
          ].map(([range, type, fee2, ex]) => (
            <div key={range} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px", gap: 8, padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{range}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{ex}</div>
              </div>
              <div style={{ fontSize: 12, color: T.sub, alignSelf: "center" }}>{type}</div>
              <div style={{ fontSize: 13, color: T.teal, fontFamily: "monospace", fontWeight: 700, alignSelf: "center", textAlign: "right" }}>{fee2}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: T.muted }}>
          Not financial advice. Fee schedule based on BND investment rules.
        </div>
      </div>
    </div>
  );
}

