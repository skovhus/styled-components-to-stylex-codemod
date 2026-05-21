import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n,p as r}from"./index-D0AHk9Y1.js";r();var i=e(),a=t.div`
  && {
    color: red;
    padding: 8px;
  }
`;function o(e){return(0,i.jsx)(`button`,{type:`button`,...e})}var s=t(o)`
  color: #1f2937;
  border: 1px solid #94a3b8;
  padding: 8px 12px;

  ${e=>e.$active?n`
          background: #dbeafe;
        `:n`
          &&:hover {
            background: #fee2e2;
          }
        `}
`,c=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`High specificity text (red, with padding)`}),(0,i.jsx)(s,{children:`Hover action`}),(0,i.jsx)(s,{$active:!0,children:`Active action`})]});export{c as App};