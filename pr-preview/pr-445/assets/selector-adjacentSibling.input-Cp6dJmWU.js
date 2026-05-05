import{c as e,p as t}from"./index-Dcyjd4O8.js";var n=t(),r=e.div`
  color: blue;
  padding: 8px 16px;

  & + & {
    color: red;
    background: lime;
  }
`,i=e.div`
  & + & {
    margin-top: 16px;
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:4,padding:16},children:[(0,n.jsx)(r,{children:`First (blue)`}),(0,n.jsx)(r,{children:`Second (red, lime - adjacent)`}),(0,n.jsx)(`span`,{children:`Spacer`}),(0,n.jsx)(r,{children:`Third (blue - not adjacent to Thing)`}),(0,n.jsx)(r,{children:`Fourth (red, lime - adjacent)`}),(0,n.jsx)(i,{children:`First row`}),(0,n.jsx)(i,{children:`Second row (margin-top)`})]});export{a as App};