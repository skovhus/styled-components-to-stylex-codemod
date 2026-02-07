import{j as t,d as i}from"./index-BMWzaOvC.js";const a=i.button.withConfig({shouldForwardProp:r=>!r.startsWith("$")})`
  background: ${r=>r.$variant==="primary"?"#BF4F74":"#4F74BF"};
  padding: ${r=>r.$size==="large"?"12px 24px":"8px 16px"};
  color: white;
`,n=()=>t.jsx("div",{children:t.jsx(a,{$variant:"primary",$size:"large",children:"Primary Large"})});export{n as App,a as TransientButton};
