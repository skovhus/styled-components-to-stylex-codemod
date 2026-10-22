import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";import{t as r}from"./helpers-daleu_Aj.js";var i=e(),a=t.div`
  display: inline-flex;

  ${e=>n`
      font-size: ${e.size+e.padding}px;
      line-height: ${e.size}px;
    `}
`,o=t.div`
  display: inline-flex;

  ${e=>r.isSafari?n`
        font-size: ${e.size-4}px;
        line-height: 1;
      `:n`
      font-size: ${e.size-3}px;
      line-height: ${e.size}px;
    `}
`,s=t.div`
  position: relative;
  top: ${r.isTouchDevice?5:1}px;
  left: ${r.isTouchDevice&&!r.isSafari?-5:-40}px;
  margin: ${r.isTouchDevice?4:8}px 12px;
  padding: ${r.isTouchDevice?4:8}px !important;
  background-color: peachpuff;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`}),(0,i.jsx)(s,{children:`Runtime touch offset`})]});export{c as App,o as BranchedContainer,a as Container};