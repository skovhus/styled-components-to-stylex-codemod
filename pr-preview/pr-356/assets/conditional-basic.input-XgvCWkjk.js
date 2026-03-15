import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";e(t(),1);var i=n(),a=r.h1`
  ${e=>e.$upsideDown&&`transform: rotate(180deg);`}
  text-align: center;
  color: #BF4F74;
`,o=r.div`
  padding: 1rem;
  background: ${e=>e.$isActive?`mediumseagreen`:`papayawhip`};
  opacity: ${e=>e.$isDisabled?.5:1};
  cursor: ${e=>e.$isDisabled?`not-allowed`:`pointer`};
`,s=r.span`
  font-weight: var(--font-weight-medium);
  ${e=>e.$dim?`opacity: 0.5;`:``}
`,c=r.div`
  ${e=>e.$open?``:`pointer-events: none; opacity: 0.1;`}
`,l=r.div`
  inset: 0;
  ${e=>e.$visible?`opacity: 1;`:`opacity: 0;`}
`,u=r(e=>(0,i.jsx)(`button`,{...e}))`
  ${e=>e.useRoundStyle!==!1&&`border-radius: 100%;`}
  padding: 4px;
`,d=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Normal Title`}),(0,i.jsx)(a,{$upsideDown:!0,children:`Upside Down Title`}),(0,i.jsx)(o,{children:`Normal Box`}),(0,i.jsx)(o,{$isActive:!0,children:`Active Box`}),(0,i.jsx)(o,{$isDisabled:!0,children:`Disabled Box`}),(0,i.jsx)(s,{$dim:!0,children:`Dim`}),(0,i.jsx)(s,{$dim:!1,children:`No dim`}),(0,i.jsx)(c,{$open:!0,children:`Visible tooltip`}),(0,i.jsx)(c,{$open:!1,children:`Hidden tooltip`}),(0,i.jsx)(c,{children:`Default hidden tooltip`}),(0,i.jsx)(l,{$visible:!0,children:`Visible overlay`}),(0,i.jsx)(l,{$visible:!1,children:`Hidden overlay`}),(0,i.jsx)(u,{children:`Icon`})]});export{d as App,s as Highlight,l as Overlay,c as Tooltip};