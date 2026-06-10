"use client";
import { useState, useEffect } from "react";

const fmt = (n: number, d = 2) =>
  (+n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});

const calcFee = (amount: number) => {
  if (!amount || amount <= 0) return {fee: 0, net: 0, pct: 0, rule: ""};
  if (amount < 2000) return {fee: 20, net: amount - 20, pct: (20/amount)*100, rule: "Fixed fee"};
  const fee = amount * 0.004;
  return {fee, net: amount - fee, pct: 0.4, rule: "0.4% rate"};
};

const useIsMobile = () => {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h, {passive: true});
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
};

export default function ToolsPage() {
  const [amt, setAmt] = useState("");
  const [currency, setCurrency] = useState("BND");
  const isMobile = useIsMobile();
  const amount = parseFloat(amt) || 0;
  const {fee, net, rule} = calcFee(amount);
  const hasValue = amount > 0;
  const examples = [500, 1500, 2000, 5000, 10000];

  return (
    <div style={{background:"#07090D",minHeight:"100vh",color:"#F0F4FF",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
      padding:isMobile?"14px 16px":"24px"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{overflow-x:hidden}
        input,select{outline:none;font-family:inherit}
        input:focus{border-color:#3B82F6!important}
        input[type=number]::-webkit-inner-spin-button{opacity:1}
        button{cursor:pointer}
        @media(max-width:375px){.fee-grid{grid-template-columns:1fr!important}}
      `}</style>

      <div style={{maxWidth:640,margin:"0 auto"}}>

        {/* Back link */}
        <a href="/" style={{color:"#00C896",fontSize:12,textDecoration:"none",
          display:"inline-flex",alignItems:"center",gap:5,marginBottom:20,
          padding:"6px 0",minHeight:36}}>
          &larr; Back to Dashboard
        </a>

        {/* Title */}
        <div style={{marginBottom:20}}>
          <h1 style={{fontSize:isMobile?20:24,fontWeight:800,letterSpacing:"-0.02em",marginBottom:4}}>
            Investment Fee Calculator
          </h1>
          <p style={{fontSize:12,color:"#8892A4"}}>
            Instantly calculate your brokerage fee before investing
          </p>
        </div>

        {/* Input card */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:14,
          padding:isMobile?16:20,marginBottom:12}}>

          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:10}}>
            INVESTMENT AMOUNT
          </div>

          {/* Currency + Amount */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              aria-label="Currency"
              style={{background:"#141820",border:"1px solid #1C2333",color:"#F0F4FF",
                padding:"12px 8px",borderRadius:8,fontSize:13,
                minWidth:isMobile?64:72,cursor:"pointer",flexShrink:0}}
            >
              {["BND","USD","SGD","MYR","GBP","EUR"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="number"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              inputMode="decimal"
              aria-label="Investment amount"
              style={{flex:1,minWidth:0,background:"#141820",border:"1px solid #1C2333",
                color:"#F0F4FF",padding:"12px 14px",borderRadius:8,
                fontSize:isMobile?20:24,fontFamily:"monospace",fontWeight:700}}
            />
          </div>

          {/* Quick select */}
          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.08em",marginBottom:8}}>
            QUICK SELECT
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {examples.map(ex => (
              <button
                key={ex}
                onClick={() => setAmt(String(ex))}
                style={{padding:isMobile?"7px 10px":"6px 12px",borderRadius:7,
                  border:`1px solid ${amt===String(ex)?"#00C896":"#1C2333"}`,
                  background:amt===String(ex)?"#00C89618":"#141820",
                  color:amt===String(ex)?"#00C896":"#8892A4",
                  cursor:"pointer",fontSize:12,fontFamily:"monospace",
                  minHeight:36,flexShrink:0}}
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
            <div style={{background:amount<2000?"#F59E0B14":"#00C89614",
              border:`1px solid ${amount<2000?"#F59E0B40":"#00C89640"}`,
              borderRadius:10,padding:"12px 16px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,
                color:amount<2000?"#F59E0B":"#00C896",marginBottom:3}}>
                {amount < 2000
                  ? "Fixed Fee Rule (below BND 2,000)"
                  : "Percentage Fee Rule (BND 2,000 and above)"}
              </div>
              <div style={{fontSize:11,color:"#8892A4"}}>{rule} applied</div>
            </div>

            {/* 4 result cards */}
            <div className="fee-grid" style={{display:"grid",
              gridTemplateColumns:"repeat(auto-fill,minmax(min(140px,100%),1fr))",
              gap:10,marginBottom:14}}>
              {[
                {label:"Investment",  val:currency+" "+fmt(amount),             color:"#F0F4FF"},
                {label:"Fee",         val:currency+" "+fmt(fee),                color:"#E5484D"},
                {label:"Net Amount",  val:currency+" "+fmt(net),                color:"#00C896"},
                {label:"Fee %",       val:fmt((fee/amount)*100,3)+"%",          color:"#F59E0B"},
              ].map(({label,val,color}) => (
                <div key={label} style={{background:"#0E1117",border:"1px solid #1C2333",
                  borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:5}}>
                    {label.toUpperCase()}
                  </div>
                  <div style={{fontSize:isMobile?15:18,fontWeight:800,color,fontFamily:"monospace",
                    wordBreak:"break-word"}}>
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Fee schedule */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,
          overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333",
            fontSize:10,color:"#8892A4",letterSpacing:"0.12em",fontWeight:600}}>
            FEE SCHEDULE
          </div>
          {[
            {range:"Below BND 2,000",     type:"Fixed",  fee:"BND 20.00",  ex:"BND 500 -> Fee: BND 20"},
            {range:"BND 2,000 and above", type:"0.4%",   fee:"0.4%",       ex:"BND 5,000 -> Fee: BND 20"},
          ].map(({range,type,fee: f2,ex}) => (
            <div key={range} style={{padding:"12px 16px",borderTop:"1px solid #1C2333"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:8,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:140}}>
                  <div style={{fontSize:12,color:"#F0F4FF",fontWeight:600,marginBottom:2}}>
                    {range}
                  </div>
                  <div style={{fontSize:11,color:"#3D4A5C"}}>{ex}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:10,color:"#8892A4",marginBottom:2}}>{type}</div>
                  <div style={{fontSize:14,color:"#00C896",fontFamily:"monospace",fontWeight:700}}>
                    {f2}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Unit test examples */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,
          overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333",
            fontSize:10,color:"#8892A4",letterSpacing:"0.12em",fontWeight:600}}>
            CALCULATION EXAMPLES
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:280}}>
              <thead>
                <tr style={{background:"#141820"}}>
                  {["Amount","Fee","Net","Rule"].map(h => (
                    <th key={h} style={{padding:"9px 14px",textAlign:"right",fontSize:10,
                      color:"#3D4A5C",letterSpacing:"0.08em",fontWeight:600,
                      textAlign:h==="Amount"||h==="Rule"?"left":"right"} as any}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[500,1500,2000,5000,10000].map(a => {
                  const {fee: f, net: n, rule: r} = calcFee(a);
                  return (
                    <tr key={a} style={{borderTop:"1px solid #1C2333",
                      background:a===amount?"#00C89608":"transparent"}}>
                      <td style={{padding:"9px 14px",fontSize:12,fontFamily:"monospace",
                        color:"#F0F4FF",fontWeight:a===amount?700:400}}>
                        {currency} {a.toLocaleString()}
                      </td>
                      <td style={{padding:"9px 14px",textAlign:"right",fontSize:12,
                        fontFamily:"monospace",color:"#E5484D"}}>
                        {currency} {fmt(f)}
                      </td>
                      <td style={{padding:"9px 14px",textAlign:"right",fontSize:12,
                        fontFamily:"monospace",color:"#00C896"}}>
                        {currency} {fmt(n)}
                      </td>
                      <td style={{padding:"9px 14px",textAlign:"right",fontSize:11,
                        color:"#8892A4"}}>{r}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{textAlign:"center",fontSize:11,color:"#3D4A5C",paddingBottom:20}}>
          Not financial advice. Fee schedule based on BND investment rules.
        </p>
      </div>
    </div>
  );
}
