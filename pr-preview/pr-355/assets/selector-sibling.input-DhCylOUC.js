import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";var n=e(),r=t.div`
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
`,o=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:4,padding:16},children:[(0,n.jsx)(r,{children:`First (blue)`}),(0,n.jsx)(r,{children:`Second (red, lime - adjacent)`}),(0,n.jsx)(r,{children:`Third (red, lime - adjacent)`}),(0,n.jsx)(i,{children:`First themed`}),(0,n.jsx)(i,{children:`Second themed (theme color)`}),(0,n.jsx)(a,{children:`First row`}),(0,n.jsx)(a,{children:`Second row (margin-top)`})]});export{o as App};