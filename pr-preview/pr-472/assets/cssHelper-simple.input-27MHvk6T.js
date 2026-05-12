import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n}from"./index-CBguSfIr.js";import{t as r}from"./helpers-f4wPBVDf.js";var i=e(),a=t.div`
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
`,s=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`})]});export{s as App,o as BranchedContainer,a as Container};