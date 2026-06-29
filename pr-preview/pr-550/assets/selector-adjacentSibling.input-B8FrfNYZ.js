import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-D4sd2IJq.js";var n=e(),r=t.div`
  color: blue;
  padding: 8px 16px;

  & + & {
    color: red;
    background: lime;
  }
`,i=t.div`
  & + & {
    margin-top: 16px;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:4,padding:16},children:[(0,n.jsx)(r,{children:`First (blue)`}),(0,n.jsx)(r,{children:`Second (red, lime - adjacent)`}),(0,n.jsx)(`span`,{children:`Spacer`}),(0,n.jsx)(r,{children:`Third (blue - not adjacent to Thing)`}),(0,n.jsx)(r,{children:`Fourth (red, lime - adjacent)`}),(0,n.jsx)(i,{children:`First row`}),(0,n.jsx)(i,{children:`Second row (margin-top)`})]});export{a as App};