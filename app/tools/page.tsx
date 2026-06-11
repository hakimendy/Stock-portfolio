"use client";
import { useState, useEffect } from "react";

const fmt = (n: number, d = 2) =>
  (+n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});

const calcFee = (amount: number) => {
  if (!amount || amount <= 0) return {fee:0, net:0, pct:0, rule:"", ruleShort:""};
  if (amount < 2000) return {fee:20, net:amount-20, pct:(20/amount)*100, rule:"Fixed fee for investments below BND 2,000", ruleShort:"Fixed BND 20"};
  const fee = amount * 0.004;
  return {fee, net:amount-fee, pct:0.4, rule:"0.4% rate for investments BND 2,000 and above", ruleShort:"0.4% rate"};
};

const useIsMobile = () => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(window.innerWidth < 640);
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h, {passive:true});
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
};

export default function ToolsPage() {
  const [amt, setAmt] = useState("");
  const [currency, setCurrency] = useState("BND");
  const isMobile = useIsMobile();
  const amount = parseFloat(amt) || 0;
  const {fee, net, pct, rule, ruleShort} = calcFee(amount);
  const hasValue = amount > 0;
  const examples = [500, 1000, 1500, 2000, 5000, 10000];

  return (
    <div style={{background:"#07090D",minHeight:"100vh",color:"#F0F4FF",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Inter',sans-serif"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{overflow-x:hidden}
        input,select{outline:none;font-family:inherit}
        input:focus{border-color:#3B82F6!important}
        input::placeholder{color:#3D4A5C}
        button{cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
        @keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
      `}</style>

      {/* Top Nav */}
      <div style={{background:"#0E1117",borderBottom:"1px solid #1C2333",
        padding:isMobile?"12px 16px":"14px 24px",
        display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:50}}>
        <a href="/"
          style={{width:32,height:32,borderRadius:8,background:"#141820",
            border:"1px solid #1C2333",display:"flex",alignItems:"center",
            justifyContent:"center",textDecoration:"none",color:"#8892A4",
            fontSize:16,flexShrink:0}}>
          &lt;
        </a>
        <div style={{flex:1}}>
          <div style={{fontSize:isMobile?14:16,fontWeight:700,color:"#F0F4FF",
            letterSpacing:"-0.02em"}}>Fee Calculator</div>
          <div style={{fontSize:10,color:"#3D4A5C",marginTop:1}}>
            BND Investment Fee Engine
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,
          background:"#00C89614",border:"1px solid #00C89630",
          borderRadius:20,padding:"4px 10px"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#00C896",
            animation:"pulse 2s infinite"}}/>
          <span style={{fontSize:10,color:"#00C896",fontWeight:600}}>LIVE CALC</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{maxWidth:560,margin:"0 auto",padding:isMobile?"16px 16px 100px":"24px 24px 60px"}}>

        {/* Hero input card */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",
          borderRadius:16,padding:isMobile?16:24,marginBottom:14}}>

          <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.12em",
            fontWeight:600,marginBottom:12}}>INVESTMENT AMOUNT</div>

          {/* Currency + Input */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <select value={currency} onChange={e=>setCurrency(e.target.value)}
              aria-label="Currency"
              style={{background:"#141820",border:"1px solid #252E40",
                color:"#F0F4FF",padding:"14px 10px",borderRadius:10,
                fontSize:13,minWidth:68,cursor:"pointer",flexShrink:0,
                WebkitAppearance:"none"}}>
              {["BND","USD","SGD","MYR","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
            </select>
            <input
              type="number" value={amt}
              onChange={e=>setAmt(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Investment amount"
              min="0"
              style={{flex:1,minWidth:0,background:"#141820",
                border:"1px solid #252E40",color:"#F0F4FF",
                padding:"14px 16px",borderRadius:10,
                fontSize:isMobile?26:32,fontFamily:"monospace",fontWeight:700,
                letterSpacing:"-0.02em"}}
            />
          </div>

          {/* Quick select chips */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {examples.map(ex=>(
              <button key={ex} onClick={()=>setAmt(String(ex))}
                style={{padding:"6px 12px",borderRadius:20,
                  border:`1px solid ${amt===String(ex)?"#00C896":"#1C2333"}`,
                  background:amt===String(ex)?"#00C89618":"transparent",
                  color:amt===String(ex)?"#00C896":"#3D4A5C",
                  fontSize:11,fontFamily:"monospace",fontWeight:500,
                  transition:"all 0.15s"}}>
                {ex.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Results - only shown when amount entered */}
        {hasValue && (
          <div style={{animation:"slideUp 0.2s ease"}}>

            {/* Rule banner */}
            <div style={{background:amount<2000?"#F59E0B0A":"#00C8960A",
              border:`1px solid ${amount<2000?"#F59E0B30":"#00C89630"}`,
              borderRadius:12,padding:"12px 16px",marginBottom:14,
              display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                background:amount<2000?"#F59E0B":"#00C896"}}/>
              <div>
                <div style={{fontSize:11,fontWeight:700,
                  color:amount<2000?"#F59E0B":"#00C896",marginBottom:2}}>
                  {ruleShort}
                </div>
                <div style={{fontSize:11,color:"#8892A4"}}>{rule}</div>
              </div>
            </div>

            {/* 4 result cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",
              gap:10,marginBottom:14}}>
              {[
                {label:"Investment",  val:`${currency} ${fmt(amount)}`,  color:"#F0F4FF", sub:"gross amount"},
                {label:"Fee",         val:`${currency} ${fmt(fee)}`,     color:"#E5484D", sub:amount<2000?"fixed":"0.4% of amount"},
                {label:"Net Amount",  val:`${currency} ${fmt(net)}`,     color:"#00C896", sub:"you invest"},
                {label:"Fee Rate",    val:`${fmt((fee/amount)*100,3)}%`, color:"#F59E0B", sub:"of investment"},
              ].map(({label,val,color,sub})=>(
                <div key={label} style={{background:"#0E1117",
                  border:"1px solid #1C2333",borderRadius:12,padding:"14px 16px"}}>
                  <div style={{fontSize:9,color:"#3D4A5C",letterSpacing:"0.1em",
                    marginBottom:6,fontWeight:600}}>{label.toUpperCase()}</div>
                  <div style={{fontSize:isMobile?16:18,fontWeight:800,color,
                    fontFamily:"monospace",marginBottom:3,wordBreak:"break-word"}}>
                    {val}
                  </div>
                  <div style={{fontSize:10,color:"#3D4A5C"}}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Visual fee flow */}
            <div style={{background:"#0E1117",border:"1px solid #1C2333",
              borderRadius:12,padding:"16px",marginBottom:14}}>
              <div style={{fontSize:10,color:"#3D4A5C",letterSpacing:"0.1em",
                marginBottom:12,fontWeight:600}}>FEE BREAKDOWN</div>

              {/* Progress bar */}
              <div style={{height:8,background:"#141820",borderRadius:4,
                overflow:"hidden",marginBottom:10,display:"flex"}}>
                <div style={{width:`${Math.min((fee/amount)*100*5,100)}%`,
                  background:"#E5484D",borderRadius:"4px 0 0 4px",
                  transition:"width 0.3s ease"}}/>
                <div style={{flex:1,background:"#00C896",
                  borderRadius:"0 4px 4px 0"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",
                fontSize:10}}>
                <span style={{color:"#E5484D"}}>Fee: {fmt((fee/amount)*100,2)}%</span>
                <span style={{color:"#00C896"}}>Net: {fmt(100-(fee/amount)*100,2)}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Fee schedule */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",
          borderRadius:12,overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"#8892A4",letterSpacing:"0.1em",
              fontWeight:600}}>FEE SCHEDULE</span>
            <span style={{fontSize:10,color:"#3D4A5C"}}>BND rules</span>
          </div>
          {[
            {range:"Below BND 2,000",    type:"Fixed",  fee:"BND 20",  ex:"e.g. BND 500 -> BND 20",    active:amount>0&&amount<2000},
            {range:"BND 2,000 and above",type:"0.4%",   fee:"0.4%",   ex:"e.g. BND 5,000 -> BND 20",  active:amount>=2000},
          ].map(({range,type,fee:f,ex,active})=>(
            <div key={range} style={{padding:"14px 16px",
              borderTop:"1px solid #1C2333",
              background:active?"#00C8960A":"transparent",
              transition:"background 0.2s"}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:active?"#F0F4FF":"#8892A4",
                    fontWeight:active?700:400,marginBottom:3,
                    display:"flex",alignItems:"center",gap:6}}>
                    {active&&<div style={{width:6,height:6,borderRadius:"50%",
                      background:"#00C896",flexShrink:0}}/>}
                    {range}
                  </div>
                  <div style={{fontSize:10,color:"#3D4A5C"}}>{ex}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:10,color:"#3D4A5C",marginBottom:2}}>{type}</div>
                  <div style={{fontSize:14,color:active?"#00C896":"#8892A4",
                    fontFamily:"monospace",fontWeight:700}}>{f}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Examples table */}
        <div style={{background:"#0E1117",border:"1px solid #1C2333",
          borderRadius:12,overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid #1C2333",
            fontSize:11,color:"#8892A4",letterSpacing:"0.1em",fontWeight:600}}>
            CALCULATION EXAMPLES
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{borderCollapse:"collapse",width:"100%",minWidth:280}}>
              <thead>
                <tr style={{background:"#141820"}}>
                  {["Amount","Fee","Net","Rule"].map(h=>(
                    <th key={h} style={{padding:"9px 14px",textAlign:h==="Amount"?"left":"right",
                      fontSize:9,color:"#3D4A5C",letterSpacing:"0.08em",fontWeight:600}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[500,1500,2000,5000,10000].map(a=>{
                  const {fee:f,net:n,ruleShort:r}=calcFee(a);
                  const isActive = Math.abs(a-amount) < 1;
                  return (
                    <tr key={a} style={{borderTop:"1px solid #1C2333",
                      background:isActive?"#00C8960A":"transparent"}}>
                      <td style={{padding:"9px 14px",fontSize:12,fontFamily:"monospace",
                        color:isActive?"#F0F4FF":"#8892A4",fontWeight:isActive?700:400}}>
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
                      <td style={{padding:"9px 14px",textAlign:"right",fontSize:10,
                        color:"#3D4A5C"}}>{r}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p style={{textAlign:"center",fontSize:10,color:"#3D4A5C",paddingBottom:20}}>
          Not financial advice. BND fee schedule applies.
        </p>
      </div>

      {/* Mobile bottom nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,
        background:"#0E1117",borderTop:"1px solid #1C2333",
        display:"flex",zIndex:50,
        paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[
          {icon:"o",  label:"Dashboard", href:"/"},
          {icon:"|",  label:"Holdings",  href:"/?tab=holdings"},
          {icon:"*",  label:"Watchlist", href:"/?tab=watchlist"},
          {icon:"@",  label:"News",      href:"/?tab=news"},
          {icon:"#",  label:"Growth",    href:"/?tab=growth"},
          {icon:"$",  label:"Calc",      href:"/tools", active:true},
        ].map(({icon,label,href,active})=>(
          <a key={label} href={href}
            style={{flex:1,padding:"10px 4px",textDecoration:"none",
              display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              color:active?"#00C896":"#3D4A5C",
              borderTop:active?"2px solid #00C896":"2px solid transparent",
              background:active?"#00C8960A":"transparent",
              transition:"all 0.15s"}}>
            <span style={{fontSize:14}}>{icon}</span>
            <span style={{fontSize:9,fontWeight:active?700:400,
              letterSpacing:"0.04em"}}>{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
