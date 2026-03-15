import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=t.span`
  padding: 4px 8px;

  ${r}:hover & {
    color: ${e=>e.$active?`green`:`gray`};
  }
`,a=t.span`
  font-size: 12px;

  ${r}:hover & {
    color: ${e=>e.$highlighted?`blue`:`inherit`};
    font-weight: 700;
  }
`,o=t.div`
  padding: 8px;

  ${r}:hover & {
    border: 2px solid ${e=>e.$accent?`red`:`transparent`};
  }
`,s=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(i,{$active:!0,children:`Active`})}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(i,{children:`Inactive`})}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(a,{$highlighted:!0,children:`Highlighted`})}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(a,{children:`Normal`})}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(o,{$accent:!0,children:`Accent Card`})}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(o,{children:`Default Card`})})]});export{s as App};