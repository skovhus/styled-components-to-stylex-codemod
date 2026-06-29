import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BECO_UlF.js";import{M as n,l as r}from"./helpers-L2tV2ARE.js";var i=e(),a=t.div`
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
`,f=t.button`
  border: 0;
  background-color: #fff7ed;
  padding: 8px;
  &:focus-visible {
    ${r};
    outline-color: #dc2626;
  }
`,p=t.button`
  border: 0;
  background-color: #ecfdf5;
  padding: 8px;
  @media (hover: hover) {
    ${r};
    outline-color: #047857;
  }
`,m=t.button`
  border: 0;
  background-color: #f8fafc;
  padding: 8px;
  &:hover {
    &:focus-visible {
      ${r}
    }
  }
`,h=t.button`
  border: 0;
  background-color: #fdf4ff;
  padding: 8px;
  &:is(:hover, :focus) {
    &:active {
      ${r}
    }
  }
`,g=t.button`
  border: 0;
  background-color: #f0fdfa;
  padding: 8px;
  &:focus-visible {
    outline-color: color-mix(
      in srgb,
      red 50%,
      blue
    );
    ${r};
  }
`,_=t.button`
  border: 0;
  background-color: #faf5ff;
  padding: 8px;
  &:hover,
  &:focus-visible {
    ${r}
  }
`,v=t.button`
  border: 0;
  background-color: #fefce8;
  padding: 8px;
  @media (min-width: 600px)
    and (max-width: 900px) {
    ${r}
  }
`,y=t.button`
  border: 0;
  background-color: #fff1f2;
  padding: 8px;
  &:hover {
    &[data-label="&"] {
      ${r}
    }
  }
`,b=()=>(0,i.jsxs)(`div`,{style:{display:`grid`,gap:12},children:[(0,i.jsx)(a,{"data-label":` after`,children:`Hover me!`}),(0,i.jsx)(o,{$isAnimating:!0,children:(0,i.jsx)(`button`,{type:`button`,children:`Focusable cell`})}),(0,i.jsx)(s,{type:`button`,children:`Logo button`}),(0,i.jsx)(c,{type:`button`,children:`Responsive logo button`}),(0,i.jsx)(l,{type:`button`,children:`Media logo button`}),(0,i.jsx)(u,{type:`button`,children:`Compact logo button`}),(0,i.jsx)(d,{type:`button`,children:`Compact media logo button`}),(0,i.jsx)(f,{type:`button`,children:`Ordered logo button`}),(0,i.jsx)(p,{type:`button`,children:`Ordered media logo button`}),(0,i.jsx)(m,{type:`button`,children:`Nested logo button`}),(0,i.jsx)(h,{type:`button`,children:`Functional nested logo button`}),(0,i.jsx)(g,{type:`button`,children:`Multiline before logo button`}),(0,i.jsx)(_,{type:`button`,children:`Multiline selector list logo button`}),(0,i.jsx)(v,{type:`button`,children:`Multiline media logo button`}),(0,i.jsx)(y,{type:`button`,"data-label":`&`,children:`Attribute amp logo button`})]});export{b as App};