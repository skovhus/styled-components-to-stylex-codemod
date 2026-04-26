import{c as e,f as t,u as n}from"./index-DimFOxuE.js";import{_ as r}from"./helpers-Dy05Q1mx.js";var i=t(),a=n.div`
  padding: 16px;
  max-width: 800px;
  background-color: #f5f5f5;

  ${t=>t.$isCompact&&e`
      @media (max-width: ${r.phone}px) {
        max-width: none;
        border-radius: 0;
      }
    `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,padding:`16px`},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{$isCompact:!0,children:`Compact`})]});export{o as App};