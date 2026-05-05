import{f as e,s as t}from"./index-BXDnwBLP.js";import{a as n,g as r,n as i}from"./helpers-BfwgNcTO.js";var a=e(),o=t.div`
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
`,f=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{style:{width:80},children:`A`}),(0,a.jsx)(s,{$m:8,style:{width:80},children:`B`}),(0,a.jsx)(c,{style:{width:80,display:`inline-block`},children:`C`}),(0,a.jsx)(l,{$faded:!0,style:{width:80},children:`D`}),(0,a.jsx)(l,{$faded:!1,style:{width:80},children:`E`}),(0,a.jsx)(u,{$tone:`#336699`,style:{width:80},children:`F`}),(0,a.jsx)(d,{$faded:!0,style:{width:80},children:`G`}),(0,a.jsx)(d,{$faded:!1,style:{width:80},children:`H`})]});export{f as App};