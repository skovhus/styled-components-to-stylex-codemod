import{j as i,c as t}from"./index-P79cZoX7.js";import{C as c,g as o}from"./helpers-CuFjqx-y.js";const r=t.label`
  background-color: ${e=>e.checked?c.cssWithAlpha(e.theme.color.bgSelected,.8):"transparent"};
  padding: 8px 12px;
`,d=t.div`
  background-color: ${e=>e.$isHighlighted?o(e.theme.isDark):"transparent"};
  padding: 8px 16px;
`,s=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[i.jsx(r,{checked:!0,children:"Checked Card"}),i.jsx(r,{checked:!1,children:"Unchecked Card"}),i.jsx(d,{$isHighlighted:!0,children:"Highlighted Row"}),i.jsx(d,{$isHighlighted:!1,children:"Normal Row"})]});export{s as App};
