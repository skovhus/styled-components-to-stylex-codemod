import{c as e,d as t,p as n}from"./index-DHBL8GAH.js";import{t as r}from"./helpers-Bq_wKMJB.js";var i=n(),a=e.div`
  display: inline-flex;

  ${e=>t`
      font-size: ${e.size+e.padding}px;
      line-height: ${e.size}px;
    `}
`,o=e.div`
  display: inline-flex;

  ${e=>r.isSafari?t`
        font-size: ${e.size-4}px;
        line-height: 1;
      `:t`
      font-size: ${e.size-3}px;
      line-height: ${e.size}px;
    `}
`,s=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`})]});export{s as App,o as BranchedContainer,a as Container};