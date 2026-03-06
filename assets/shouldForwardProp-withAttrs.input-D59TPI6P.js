import{j as l,c as n}from"./index-CQS6McHQ.js";const t=n("span").withConfig({shouldForwardProp:e=>!["align","selectable"].includes(e)}).attrs(e=>({align:e.align??"left",selectable:e.selectable??!1}))`
  font-style: normal;
  ${e=>e.align?`text-align: ${e.align};`:""}
  ${e=>e.selectable?"user-select: text;":""};
`;function s(){return l.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[l.jsx(t,{children:"Default left, not selectable"}),l.jsx(t,{align:"center",children:"Centered"}),l.jsx(t,{selectable:!0,children:"Selectable"})]})}export{s as App,t as Text};
