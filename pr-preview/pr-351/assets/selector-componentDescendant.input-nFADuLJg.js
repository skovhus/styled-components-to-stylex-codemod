import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";var n=e(),r=t.div`
  padding: 16px;
  background: papayawhip;
`,i=t.div`
  color: gray;
  padding: 8px;

  ${r} & {
    color: blue;
    background: lavender;
  }
`,a=t.div`
  color: gray;
  padding: 8px;

  ${r}:hover & {
    color: red;
  }

  ${r} & {
    background: lavender;
  }
`,o=t.div`
  color: gray;
  padding: 8px;

  ${r}:hover & {
    color: green;
  }
`,s=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,n.jsx)(i,{children:`Outside Wrapper (gray)`}),(0,n.jsxs)(r,{children:[(0,n.jsx)(i,{children:`Inside Wrapper (blue, lavender)`}),(0,n.jsx)(a,{children:`Inside Wrapper (hover=red, bg=lavender)`}),(0,n.jsx)(o,{children:`Inside Wrapper (hover=green)`})]})]});export{s as App};