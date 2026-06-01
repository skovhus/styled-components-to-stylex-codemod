import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n}from"./index-BbCWSlwN.js";import{t as r}from"./helpers-87xljZ4C.js";var i=e(),a=n.div`
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
`,s=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`})]});export{s as App,o as BranchedContainer,a as Container};