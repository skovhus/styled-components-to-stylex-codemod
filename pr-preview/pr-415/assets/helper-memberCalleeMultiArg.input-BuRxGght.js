import{f as e,s as t}from"./index-BKN613Sy.js";import{a as n,n as r}from"./helpers-0PdfuzDt.js";var i=e(),a=t.div`
  background-color: ${({theme:e})=>r.cssWithAlpha(e.color.bgBase,.4)};
  padding: 8px 16px;
`,o=t.div`
  background: ${e=>r.cssWithAlpha(e.theme.color.bgBase,.2)};
  margin: ${e=>e.$m}px;
`,s=t.span`
  background: ${e=>r.cssWithAlpha(n(`bgBase`)(e),.8)};
  padding: 2px 6px;
`,c=t.div`
  background: ${e=>e.$faded?r.cssWithAlpha(n(`bgBase`)(e),.8):n(`bgBase`)};
  padding: 4px;
`,l=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Toggle`}),(0,i.jsx)(o,{$m:8,children:`Box with margin`}),(0,i.jsx)(s,{children:`Label with nested color helper`}),(0,i.jsx)(c,{$faded:!0,children:`Faded panel`}),(0,i.jsx)(c,{$faded:!1,children:`Solid panel`})]});export{l as App};