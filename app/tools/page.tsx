"use client";
import { useState } from "react";

const fmt = (n: number, d = 2) =>
  (+n).toLocaleString("en-US", {minimumFractionDigits: d, maximumFractionDigits: d});

const calcFee = (amount: number) => {
  if (!amount || amount <= 0) return {fee: 0, net: 0, pct: 0, rule: ""};
  if (amount < 2000) return {fee: 20, net: amount - 20, pct: (20/amount)*100, rule: "Fixed fee"};
  const fee = amount * 0.004;
  return {fee, net: amount - fee, pct: 0.4, rule: "0.4% rate"};
};

export default function ToolsPage() {
  const [amt, setAmt] = useState("");
  const [currency, setCurrency] = useState("BND");
  const amount = parseFloat(amt) || 0;
  const {fee, net, rule} = calcFee(amount);
  const hasValue = amount > 0;
  const examples = [500, 1500, 2000, 5000, 10000];

  return (
    <div style={{background:"#07090D",minHeight:"100vh",color:"#F0F4FF",fontFamily:"-apple-system,sans-serif",padding:"20px 16px"}}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}input,select{outline:none;font-family:inherit}input:focus{border-color:#3B82F6!important}`}</style>

      <div style={{maxWidth:600,margin:"0 auto 24px"}}>
        <a href="/" style={{color:"#00C896",fontSize:12,textDecoration:"none",display:"inline-block",marginBottom:16}}>
          &lt;- Back to Dashboard
        </a>
        <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.02em",marginBottom:4}}>
          Investment Fee Calculator
        </div>
        <div style={{fontSize:13,color:"#8892A4"}}>
          Calculate your brokerage fee before you invest
        </div>
      </div>

      <div style={{maxWidth:600,margin:"0 auto"}}>

        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:14,padding:20,marginBottom:14}}>
          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:10}}>INVESTMENT AMOUNT</div>

          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              style={{background:"#141820",border:"1px solid #1C2333",color:"#F0F4FF",padding:"12px 10px",borderRadius:8,fontSize:13,minWidth:72,cursor:"pointer"}}
            >
              {["BND","USD","SGD","MYR","GBP","EUR"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="number"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              placeholder="e.g. 5000"
              min="0"
              aria-label="Investment amount"
              style={{flex:1,background:"#141820",border:"1px solid #1C2333",color:"#F0F4FF",padding:"12px 16px",borderRadius:8,fontSize:22,fontFamily:"monospace",fontWeight:700}}
            />
          </div>

          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.08em",marginBottom:8}}>QUICK SELECT</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {examples.map(ex => (
              <button
                key={ex}
                onClick={() => setAmt(String(ex))}
                style={{padding:"6px 12px",borderRadius:7,border:`1px solid ${amt===String(ex)?"#00C896":"#1C2333"}`,background:amt===String(ex)?"#00C89618":"#141820",color:amt===String(ex)?"#00C896":"#8892A4",cursor:"pointer",fontSize:12,fontFamily:"monospace"}}
              >
                {currency} {ex.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {hasValue && (
          <>
            <div style={{background:amount<2000?"#F59E0B14":"#00C89614",border:`1px solid ${amount<2000?"#F59E0B40":"#00C89640"}`,borderRadius:10,padding:"12px 16px",marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:amount<2000?"#F59E0B":"#00C896",marginBottom:3}}>
                {amount < 2000 ? "Fixed Fee Rule (below BND 2,000)" : "Percentage Fee Rule (BND 2,000 and above)"}
              </div>
              <div style={{fontSize:11,color:"#8892A4"}}>{rule} applied</div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {label:"Investment",  val:currency+" "+fmt(amount), color:"#F0F4FF"},
                {label:"Fee",         val:currency+" "+fmt(fee),    color:"#E5484D"},
                {label:"Net Amount",  val:currency+" "+fmt(net),    color:"#00C896"},
                {label:"Fee %",       val:fmt((fee/amount)*100,3)+"%", color:"#F59E0B"},
              ].map(({label,val,color}) => (
                <div key={label} style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.1em",marginBottom:5}}>{label.toUpperCase()}</div>
                  <div style={{fontSize:18,fontWeight:800,color,fontFamily:"monospace"}}>{val}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{background:"#0E1117",border:"1px solid #1C2333",borderRadius:12,overflow:"hidden"}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333",fontSize:10,color:"#8892A4",letterSpacing:"0.12em",fontWeight:600}}>FEE SCHEDULE</div>
          {[
            ["Below BND 2,000",     "Fixed",  "BND 20.00", "BND 500 -> Fee: BND 20"],
            ["BND 2,000 and above", "0.4%",   "0.4%",      "BND 5,000 -> Fee: BND 20"],
          ].map(([range,type,fee2,ex]) => (
            <div key={range} style={{display:"grid",gridTemplateColumns:"1fr 60px 80px",gap:8,padding:"12px 16px",borderTop:"1px solid #1C2333"}}>
              <div>
                <div style={{fontSize:12,color:"#F0F4FF",fontWeight:600}}>{range}</div>
                <div style={{fontSize:11,color:"#3D4A5C",marginTop:2}}>{ex}</div>
              </div>
              <div style={{fontSize:12,color:"#8892A4",alignSelf:"center"}}>{type}</div>
              <div style={{fontSize:13,color:"#00C896",fontFamily:"monospace",fontWeight:700,alignSelf:"center",textAlign:"right"}}>{fee2}</div>
            </div>
          ))}
        </div>

        <div style={{marginTop:16,textAlign:"center",fontSize:11,color:"#3D4A5C"}}>
          Not financial advice. Fee schedule based on BND investment rules.
        </div>
      </div>
    </div>
  );
}
