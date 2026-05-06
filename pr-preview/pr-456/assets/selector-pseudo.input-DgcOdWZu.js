import{c as e,p as t}from"./index-zo-_EXaa.js";var n=t(),r=e.div`
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
`,i=e.div`
  position: relative;
  z-index: ${e=>e.$isAnimating?10:void 0};

  &:focus-within {
    z-index: 12;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,n.jsx)(r,{"data-label":` after`,children:`Hover me!`}),(0,n.jsx)(i,{$isAnimating:!0,children:(0,n.jsx)(`button`,{type:`button`,children:`Focusable cell`})})]});export{a as App};