import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BTA89BTp.js";var n=e(),r=t.div`
  color: blue;
  padding: 8px 16px;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }
`,i=t.div`
  color: blue;

  & + & {
    color: ${e=>e.theme.color.labelBase};
  }
`,a=t.div`
  & + & {
    margin-top: 16px;
  }
`,o=t.div`
  color: blue;

  &:hover {
    & + & {
      color: red;
    }
  }
`,s=t.div`
  color: blue;

  & + & {
    &:hover {
      color: green;
    }
  }
`,c=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:4,padding:16},children:[(0,n.jsx)(r,{children:`First (blue)`}),(0,n.jsx)(r,{children:`Second (red, lime - adjacent)`}),(0,n.jsx)(r,{children:`Third (red, lime - adjacent)`}),(0,n.jsx)(i,{children:`First themed`}),(0,n.jsx)(i,{children:`Second themed (theme color)`}),(0,n.jsx)(a,{children:`First row`}),(0,n.jsx)(a,{children:`Second row (margin-top)`}),(0,n.jsx)(o,{children:`First hover-sibling`}),(0,n.jsx)(o,{children:`Second hover-sibling (red on hover)`}),(0,n.jsx)(s,{children:`First sibling-hover`}),(0,n.jsx)(s,{children:`Second sibling-hover (green on hover)`})]});export{c as App};