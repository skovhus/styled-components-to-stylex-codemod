import{f as e,s as t}from"./index-Brrja96W.js";import{a as n,g as r,n as i}from"./helpers-D-PEgU2K.js";var a=e(),o=t.div`
  background-color: ${({theme:e})=>i.cssWithAlpha(e.color.bgBase,.4)};
  padding: 8px 16px;
`,s=t.div`
  background: ${e=>i.cssWithAlpha(e.theme.color.bgBase,.2)};
  margin: ${e=>e.$m}px;
`,c=t.span`
  background: ${e=>i.cssWithAlpha(n(`bgBase`)(e),.8)};
  padding: 2px 6px;
`,l=t.div`
  background: ${e=>e.$faded?i.cssWithAlpha(n(`bgBase`)(e),.8):n(`bgBase`)};
  padding: 4px;
`,u=t.div`
  background: ${e=>i.cssWithAlpha(e.$tone,.4)};
  padding: 4px;
`,d=t.div`
  background: ${e=>i.cssWithAlpha(e.$faded?r(`bgBase`,`theme`)(e):r(`bgSub`),.7)};
  padding: 4px;
`,f=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{children:`Toggle`}),(0,a.jsx)(s,{$m:8,children:`Box with margin`}),(0,a.jsx)(c,{children:`Label with nested color helper`}),(0,a.jsx)(l,{$faded:!0,children:`Faded panel`}),(0,a.jsx)(l,{$faded:!1,children:`Solid panel`}),(0,a.jsx)(u,{$tone:`#336699`,children:`Plain swatch`}),(0,a.jsx)(d,{$faded:!0,children:`Faded mixed panel`}),(0,a.jsx)(d,{$faded:!1,children:`Direct mixed panel`})]});export{f as App};