import{j as a,a as p}from"./index-BDzX_pJA.js";function g(t,n){const r=t.slice(1),s=r.length===3?r.split("").map(e=>e+e).join(""):r;if(s.length!==6)return t;const i=Number.parseInt(s.slice(0,2),16),o=Number.parseInt(s.slice(2,4),16),c=Number.parseInt(s.slice(4,6),16),l=Math.min(1,Math.max(0,n));return`rgba(${i}, ${o}, ${c}, ${l})`}const d={cssWithAlpha(t,n){return t.startsWith("#")?g(t,n):t}},h=p.div`
  background-color: ${({theme:t})=>d.cssWithAlpha(t.color.bgBase,.4)};
  padding: 8px 16px;
`,u=()=>a.jsx("div",{style:{display:"flex",gap:16,padding:16},children:a.jsx(h,{children:"Toggle"})});export{u as App};
