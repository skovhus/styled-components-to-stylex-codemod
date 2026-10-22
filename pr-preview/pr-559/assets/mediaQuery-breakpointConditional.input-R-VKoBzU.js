import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";import{S as r}from"./helpers-daleu_Aj.js";var i=e(),a=t.div`
  padding: 16px;
  max-width: 800px;
  background-color: #f5f5f5;

  ${e=>e.$isCompact&&n`
      @media (max-width: ${r.phone}px) {
        max-width: none;
        border-radius: 0;
      }
    `}
`,o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,padding:`16px`},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{$isCompact:!0,children:`Compact`})]});export{o as App};