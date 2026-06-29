import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-C-yWZMqh.js";import{t as r}from"./helpers-E_1R5lpk.js";var i=e(),a=n.div`
  display: inline-flex;

  ${e=>t`
      font-size: ${e.size+e.padding}px;
      line-height: ${e.size}px;
    `}
`,o=n.div`
  display: inline-flex;

  ${e=>r.isSafari?t`
        font-size: ${e.size-4}px;
        line-height: 1;
      `:t`
      font-size: ${e.size-3}px;
      line-height: ${e.size}px;
    `}
`,s=n.div`
  position: relative;
  top: ${r.isTouchDevice?5:1}px;
  left: ${r.isTouchDevice&&!r.isSafari?-5:-40}px;
  margin: ${r.isTouchDevice?4:8}px 12px;
  padding: ${r.isTouchDevice?4:8}px !important;
  background-color: peachpuff;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`}),(0,i.jsx)(s,{children:`Runtime touch offset`})]});export{c as App,o as BranchedContainer,a as Container};