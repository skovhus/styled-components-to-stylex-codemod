import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BCxlhZuN.js";var n=e(),r=t.div`
  color: blue;
  padding: 8px 16px;

  /* General sibling: matching element appears later in the same parent */
  & ~ & {
    color: red;
    background: lime;
  }
`,i=t.div`
  color: blue;

  & ~ & {
    color: ${e=>e.theme.color.labelBase};
  }
`,a=t.div`
  & ~ & {
    margin-top: 16px;
  }
`,o=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:4,padding:16},children:[(0,n.jsx)(r,{children:`First (blue)`}),(0,n.jsx)(r,{children:`Second (red, lime - general sibling)`}),(0,n.jsx)(r,{children:`Third (red, lime - general sibling)`}),(0,n.jsx)(i,{children:`First themed`}),(0,n.jsx)(i,{children:`Second themed (theme color)`}),(0,n.jsx)(a,{children:`First row`}),(0,n.jsx)(a,{children:`Second row (margin-top)`})]});export{o as App};