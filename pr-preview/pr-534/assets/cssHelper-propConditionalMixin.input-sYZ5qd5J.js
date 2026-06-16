import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-DjNtzN5I.js";var r=e(),i=t`
  width: ${e=>e.$big?`100px`:`50px`};
`,a=n.div`
  ${i}
  background-color: lightsteelblue;
  padding: 8px;
`,o=n.div`
  ${i}
  background-color: peachpuff;
  height: 40px;
`,s=t`
  cursor: pointer;
  opacity: ${e=>e.$on?`1`:`0.5`};

  &:hover {
    background-color: gold;
  }
`,c=n.button`
  ${s}
  padding: 6px 10px;
`,l=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,r.jsx)(a,{$big:!0,children:`Big tile (100px)`}),(0,r.jsx)(a,{children:`Small tile (50px)`}),(0,r.jsx)(o,{$big:!0,children:`Big panel`}),(0,r.jsx)(o,{children:`Small panel`}),(0,r.jsx)(c,{$on:!0,children:`On`}),(0,r.jsx)(c,{children:`Off`})]});export{l as App};