import{c as e,f as t,u as n}from"./index-BPaLyyRP.js";import{t as r}from"./helpers-xqqmnoiX.js";var i=t(),a=n.div`
  display: inline-flex;

  ${t=>e`
      font-size: ${t.size+t.padding}px;
      line-height: ${t.size}px;
    `}
`,o=n.div`
  display: inline-flex;

  ${t=>r.isSafari?e`
        font-size: ${t.size-4}px;
        line-height: 1;
      `:e`
      font-size: ${t.size-3}px;
      line-height: ${t.size}px;
    `}
`,s=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{size:16,padding:4,children:`Hello World`}),(0,i.jsx)(o,{size:16,children:`Branched`})]});export{s as App,o as BranchedContainer,a as Container};