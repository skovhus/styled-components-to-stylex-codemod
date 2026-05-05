import{c as e,p as t}from"./index-dvqWiS4X.js";import{_ as n,a as r,n as i}from"./helpers-CQ-hh9o1.js";var a=t(),o=e.div`
  background-color: ${({theme:e})=>i.cssWithAlpha(e.color.bgBase,.4)};
  padding: 8px 16px;
`,s=e.div`
  background: ${e=>i.cssWithAlpha(e.theme.color.bgBase,.2)};
  margin: ${e=>e.$m}px;
`,c=e.span`
  background: ${e=>i.cssWithAlpha(r(`bgBase`)(e),.8)};
  padding: 2px 6px;
`,l=e.div`
  background: ${e=>e.$faded?i.cssWithAlpha(r(`bgBase`)(e),.8):r(`bgBase`)};
  padding: 4px;
`,u=e.div`
  background: ${e=>i.cssWithAlpha(e.$tone,.4)};
  padding: 4px;
`,d=e.div`
  background: ${e=>i.cssWithAlpha(e.$faded?n(`bgBase`,`theme`)(e):n(`bgSub`),.7)};
  padding: 4px;
`,f=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{style:{width:80},children:`A`}),(0,a.jsx)(s,{$m:8,style:{width:80},children:`B`}),(0,a.jsx)(c,{style:{width:80,display:`inline-block`},children:`C`}),(0,a.jsx)(l,{$faded:!0,style:{width:80},children:`D`}),(0,a.jsx)(l,{$faded:!1,style:{width:80},children:`E`}),(0,a.jsx)(u,{$tone:`#336699`,style:{width:80},children:`F`}),(0,a.jsx)(d,{$faded:!0,style:{width:80},children:`G`}),(0,a.jsx)(d,{$faded:!1,style:{width:80},children:`H`})]});export{f as App};