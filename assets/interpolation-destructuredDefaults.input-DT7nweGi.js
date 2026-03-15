import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-Dda2rlA_.js";var n=e(),r=t.button`
  color: ${({color:e=`hotpink`})=>e||`blue`};
`,i=t.div`
  padding: ${({size:e=16})=>e===16?`1rem`:`${e}px`};
`,a=t.div`
  margin: ${({margin:e=10})=>e||5}px;
`,o=()=>(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r,{children:`Default (should be hotpink)`}),(0,n.jsx)(r,{color:``,children:`Empty string (should be blue)`}),(0,n.jsx)(r,{color:`red`,children:`Red`}),(0,n.jsx)(i,{children:`Default size (should be 1rem)`}),(0,n.jsx)(i,{size:16,children:`Size 16 (should be 1rem)`}),(0,n.jsx)(i,{size:24,children:`Size 24 (should be 24px)`}),(0,n.jsx)(a,{children:`Default (should be 10px)`}),(0,n.jsx)(a,{margin:0,children:`Zero (should be 5px)`}),(0,n.jsx)(a,{margin:20,children:`20px`})]});export{o as App};