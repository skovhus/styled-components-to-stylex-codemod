import"./react-D4cBbUL-.js";import{f as e,s as t,u as n}from"./index-Dda2rlA_.js";var r=e(),i=n`
  display: grid;
  grid-template-columns: 1fr 2fr;
  grid-column: 1 / -1;
  align-items: center;
  padding: 0 8px;
  min-height: 36px;
  background: ${({theme:e})=>e.color.bgBase};
`,a=t.div`
  ${i}
  position: sticky;
  top: var(--sticky-top, 0px);
  z-index: 3; /* above regular rows */
  border-top: 1px solid ${({theme:e})=>e.color.bgBorderFaint};
  border-bottom: 1px solid ${({theme:e})=>e.color.bgBorderFaint};
`,o=t.div`
  ${i}
  &:hover {
    background: ${({theme:e})=>e.color.bgBaseHover};
  }
`,s=t.div`
  ${e=>e.$opaque&&n`
      opacity: 0.4;
    `}
  width: 10px;
  height: 10px;
  background-color: red;
`,c=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{children:`Group`}),(0,r.jsx)(o,{children:`Project`}),(0,r.jsx)(s,{$opaque:!0}),(0,r.jsx)(s,{$opaque:!1})]});export{c as App};