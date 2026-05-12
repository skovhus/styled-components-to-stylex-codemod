import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-CBguSfIr.js";import{j as n}from"./helpers-f4wPBVDf.js";var r=e(),i=t.div`
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
`,a=t.div`
  position: relative;
  z-index: ${e=>e.$isAnimating?n.modal:void 0};

  &:focus-within {
    z-index: ${n.modal+2};
  }
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,r.jsx)(i,{"data-label":` after`,children:`Hover me!`}),(0,r.jsx)(a,{$isAnimating:!0,children:(0,r.jsx)(`button`,{type:`button`,children:`Focusable cell`})})]});export{o as App};