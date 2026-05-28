import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-CXEeL4v3.js";var n=e(),r=t.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`,i=t.div`
  color: blue;
  padding: 8px;

  & ~ & {
    border-top: 1px solid gray;
  }
`,a=()=>(0,n.jsxs)(r,{children:[(0,n.jsx)(i,{children:`First`}),(0,n.jsx)(i,{children:`Second (should have border-top)`})]});export{a as App};