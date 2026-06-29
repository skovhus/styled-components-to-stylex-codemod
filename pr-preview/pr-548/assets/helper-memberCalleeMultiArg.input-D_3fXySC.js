import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BjfJDrQX.js";import{a as n,n as r,v as i}from"./helpers-BbxwZBlC.js";var a=e(),o=t.div`
  background-color: ${({theme:e})=>r.cssWithAlpha(e.color.bgBase,.4)};
  padding: 8px 16px;
`,s=t.div`
  background: ${e=>r.cssWithAlpha(e.theme.color.bgBase,.2)};
  margin: ${e=>e.$m}px;
`,c=t.span`
  background: ${e=>r.cssWithAlpha(n(`bgBase`)(e),.8)};
  padding: 2px 6px;
`,l=t.div`
  background: ${e=>e.$faded?r.cssWithAlpha(n(`bgBase`)(e),.8):n(`bgBase`)};
  padding: 4px;
`,u=t.div`
  background: ${e=>r.cssWithAlpha(e.$tone,.4)};
  padding: 4px;
`,d=t.div`
  background: ${e=>r.cssWithAlpha(e.$faded?i(`bgBase`,`theme`)(e):i(`bgSub`),.7)};
  padding: 4px;
`,f=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{style:{width:80},children:`A`}),(0,a.jsx)(s,{$m:8,style:{width:80},children:`B`}),(0,a.jsx)(c,{style:{width:80,display:`inline-block`},children:`C`}),(0,a.jsx)(l,{$faded:!0,style:{width:80},children:`D`}),(0,a.jsx)(l,{$faded:!1,style:{width:80},children:`E`}),(0,a.jsx)(u,{$tone:`#336699`,style:{width:80},children:`F`}),(0,a.jsx)(d,{$faded:!0,style:{width:80},children:`G`}),(0,a.jsx)(d,{$faded:!1,style:{width:80},children:`H`})]});export{f as App};