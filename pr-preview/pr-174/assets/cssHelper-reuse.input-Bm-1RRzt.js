import{j as r,a as e,b as i}from"./index-C9XqlRtz.js";const s=i`
  display: grid;
  grid-template-columns: 1fr 2fr;
  grid-column: 1 / -1;
  align-items: center;
  padding: 0 8px;
  min-height: 36px;
  background: ${({theme:o})=>o.color.bgBase};
`,a=e.div`
  ${s}
  position: sticky;
  top: var(--sticky-top, 0px);
  z-index: 3; /* above regular rows */
  border-top: 1px solid ${({theme:o})=>o.color.bgBorderFaint};
  border-bottom: 1px solid ${({theme:o})=>o.color.bgBorderFaint};
`,d=e.div`
  ${s}
  &:hover {
    background: ${({theme:o})=>o.color.bgBaseHover};
  }
`,t=e.div`
  ${o=>o.$opaque&&i`
      opacity: 0.4;
    `}
  width: 10px;
  height: 10px;
  background-color: red;
`,p=()=>r.jsxs("div",{children:[r.jsx(a,{children:"Group"}),r.jsx(d,{children:"Project"}),r.jsx(t,{$opaque:!0}),r.jsx(t,{$opaque:!1})]});export{p as App};
