import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-Bt7rhY7S.js";n();var i=e();function a(e){return(0,i.jsx)(`button`,{type:`button`,...e})}var o=r(a)`
  color: #1f2937;
  border: 1px solid #94a3b8;
  padding: 8px 12px;

  ${e=>e.$active?t`
          background: #dbeafe;
        `:t`
          &&:hover {
            background: #fee2e2;
          }
        `}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Hover action`}),(0,i.jsx)(o,{$active:!0,children:`Active action`})]});export{s as App};