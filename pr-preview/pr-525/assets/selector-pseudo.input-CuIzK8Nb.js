import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-B5oQzUBP.js";import{j as n,l as r}from"./helpers-BAT5NLvu.js";var i=e(),a=t.div`
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
`,u=()=>(0,i.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,i.jsx)(a,{"data-label":` after`,children:`Hover me!`}),(0,i.jsx)(o,{$isAnimating:!0,children:(0,i.jsx)(`button`,{type:`button`,children:`Focusable cell`})}),(0,i.jsx)(s,{type:`button`,children:`Logo button`}),(0,i.jsx)(c,{type:`button`,children:`Responsive logo button`}),(0,i.jsx)(l,{type:`button`,children:`Media logo button`})]});export{u as App};