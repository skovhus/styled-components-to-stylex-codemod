import{R as a,j as n,c as r}from"./index-B5cHh60p.js";const d=r.div`
  opacity: ${e=>e.$open?1:0};
  transition: opacity 200ms ease-out;
  transition-delay: ${e=>e.$open?e.$delay:0}ms;
  background-color: #3b82f6;
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
`;function s(e){const{children:t,...o}=e;return n.jsx(d,{...o,children:t})}const c=()=>{const[e,t]=a.useState(!0);return a.useEffect(()=>{const o=window.setInterval(()=>t(i=>!i),1200);return()=>window.clearInterval(o)},[]),n.jsxs("div",{style:{display:"flex",gap:12,fontFamily:"system-ui",fontSize:14},children:[n.jsx(s,{$open:e,$delay:0,children:"0ms delay"}),n.jsx(s,{$open:e,$delay:200,children:"200ms delay"}),n.jsx(s,{$open:e,$delay:600,children:"600ms delay"})]})};export{c as App,s as AutoFadingContainer};
