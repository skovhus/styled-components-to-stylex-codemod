import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-SKTdmQDW.js";import{j as n,l as r}from"./helpers-BhOqAy6U.js";var i=e(),a=t.div`
  border-right: 1px solid hotpink;
  color: blue;

  &:hover {
    color: red;
  }

  &:focus {
    outline: 2px solid blue;
  }

  &::before {
    content: "🔥";
  }

  &::after {
    content: attr(data-label);
  }
`,o=t.div`
  position: relative;
  z-index: ${e=>e.$isAnimating?n.modal:void 0};

  &:focus-within {
    z-index: ${n.modal+2};
  }
`,s=t.button`
  border: 0;
  background-color: transparent;
  padding: 8px;

  &:focus-visible {
    ${r}
  }
`,c=t.button`
  border: 0;
  background-color: white;
  padding: 8px;

  @media (prefers-reduced-motion: no-preference) {
    &:focus-visible {
      ${r}
    }
  }
`,l=t.button`
  border: 0;
  background-color: #f8fafc;
  padding: 8px;

  @media (hover: hover) {
    ${r}
  }
`,u=t.button`
  border: 0;
  background-color: #f1f5f9;
  padding: 8px;
  &:focus-visible { background-color: #dcfce7; ${r}; }
`,d=t.button`
  border: 0;
  background-color: #e2e8f0;
  padding: 8px;
  @media (hover: hover) { color: #1d4ed8; ${r}; }
`,f=()=>(0,i.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,i.jsx)(a,{"data-label":` after`,children:`Hover me!`}),(0,i.jsx)(o,{$isAnimating:!0,children:(0,i.jsx)(`button`,{type:`button`,children:`Focusable cell`})}),(0,i.jsx)(s,{type:`button`,children:`Logo button`}),(0,i.jsx)(c,{type:`button`,children:`Responsive logo button`}),(0,i.jsx)(l,{type:`button`,children:`Media logo button`}),(0,i.jsx)(u,{type:`button`,children:`Compact logo button`}),(0,i.jsx)(d,{type:`button`,children:`Compact media logo button`})]});export{f as App};