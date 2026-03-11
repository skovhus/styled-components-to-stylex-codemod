import{j as l,c as t}from"./index-mAN4B_0H.js";const o=t.div`
  padding: 4px 8px;
  border-radius: 4px;
  color: ${e=>e.textColor?e.theme.color[e.textColor]:e.theme.color.labelTitle};
`,a=()=>l.jsxs("div",{children:[l.jsx(o,{children:"Default color (labelTitle)"}),l.jsx(o,{textColor:"labelBase",children:"Custom color (labelBase)"}),l.jsx(o,{textColor:"labelMuted",children:"Custom color (labelMuted)"})]});export{a as App,o as Badge};
