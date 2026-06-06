import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-B7avsl1j.js";n();var r=e(),i=t.h1`
  ${e=>e.$upsideDown&&`transform: rotate(180deg);`}
  text-align: center;
  color: #BF4F74;
`,a=t.div`
  padding: 1rem;
  background: ${e=>e.$isActive?`mediumseagreen`:`papayawhip`};
  opacity: ${e=>e.$isDisabled?.5:1};
  cursor: ${e=>e.$isDisabled?`not-allowed`:`pointer`};
`,o=t.span`
  font-weight: var(--font-weight-medium);
  ${e=>e.$dim?`opacity: 0.5;`:``}
`,s=t.div`
  ${e=>e.$open?``:`pointer-events: none; opacity: 0.1;`}
`,c=t.div`
  inset: 0;
  ${e=>e.$visible?`opacity: 1;`:`opacity: 0;`}
`,l=t(e=>(0,r.jsx)(`button`,{...e}))`
  ${e=>e.useRoundStyle!==!1&&`border-radius: 100%;`}
  padding: 4px;
`,u=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Normal Title`}),(0,r.jsx)(i,{$upsideDown:!0,children:`Upside Down Title`}),(0,r.jsx)(a,{children:`Normal Box`}),(0,r.jsx)(a,{$isActive:!0,children:`Active Box`}),(0,r.jsx)(a,{$isDisabled:!0,children:`Disabled Box`}),(0,r.jsx)(o,{$dim:!0,children:`Dim`}),(0,r.jsx)(o,{$dim:!1,children:`No dim`}),(0,r.jsx)(s,{$open:!0,children:`Visible tooltip`}),(0,r.jsx)(s,{$open:!1,children:`Hidden tooltip`}),(0,r.jsx)(s,{children:`Default hidden tooltip`}),(0,r.jsx)(c,{$visible:!0,children:`Visible overlay`}),(0,r.jsx)(c,{$visible:!1,children:`Hidden overlay`}),(0,r.jsx)(l,{children:`Icon`})]});export{u as App,o as Highlight,c as Overlay,s as Tooltip};