import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-B3wC_Q0j.js";import{S as r}from"./helpers-CkH0BVvA.js";var i=e(),a=n.div`
  padding: 16px;
  max-width: 800px;
  background-color: #f5f5f5;

  ${e=>e.$isCompact&&t`
      @media (max-width: ${r.phone}px) {
        max-width: none;
        border-radius: 0;
      }
    `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,padding:`16px`},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{$isCompact:!0,children:`Compact`})]});export{o as App};