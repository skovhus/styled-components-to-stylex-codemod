import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DQy262oc.js";var n=e(),r=t.button`
  color: ${({color:e=`hotpink`})=>e||`blue`};
`,i=t.div`
  padding: ${({size:e=16})=>e===16?`1rem`:`${e}px`};
`,a=t.div`
  margin: ${({margin:e=10})=>e||5}px;
`,o=t.span`
  padding: 4px 8px;
  background-color: lightseagreen;
  border-radius: ${({$rounded:e=!0})=>e?`12px`:`0`};
`,s=t.div`
  padding: 8px;
  ${({$framed:e=!0})=>e&&`border: 2px solid darkslategray;`}
`,c=()=>(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(r,{children:`Default (should be hotpink)`}),(0,n.jsx)(r,{color:``,children:`Empty string (should be blue)`}),(0,n.jsx)(r,{color:`red`,children:`Red`}),(0,n.jsx)(i,{children:`Default size (should be 1rem)`}),(0,n.jsx)(i,{size:16,children:`Size 16 (should be 1rem)`}),(0,n.jsx)(i,{size:24,children:`Size 24 (should be 24px)`}),(0,n.jsx)(a,{children:`Default (should be 10px)`}),(0,n.jsx)(a,{margin:0,children:`Zero (should be 5px)`}),(0,n.jsx)(a,{margin:20,children:`20px`}),(0,n.jsx)(o,{children:`Default (rounded)`}),(0,n.jsx)(o,{$rounded:!1,children:`Square`}),(0,n.jsx)(o,{$rounded:!0,children:`Rounded`}),(0,n.jsx)(s,{children:`Default (framed)`}),(0,n.jsx)(s,{$framed:!1,children:`No frame`})]});export{c as App};