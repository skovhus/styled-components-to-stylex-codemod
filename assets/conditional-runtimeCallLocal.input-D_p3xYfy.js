import{j as t,c as r}from"./index-CScyS67Z.js";function o(i){return i?"rgba(255, 255, 255, 0.08)":"rgba(0, 0, 0, 0.04)"}const e=r.div`
  background-color: ${i=>i.$isHighlighted?o(i.theme.isDark):"transparent"};
  padding: 8px 16px;
`,l=()=>t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[t.jsx(e,{$isHighlighted:!0,children:"Highlighted Row"}),t.jsx(e,{$isHighlighted:!1,children:"Normal Row"})]});export{l as App};
