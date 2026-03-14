import{j as e,s as n,c as s}from"./index-foWZVELY.js";import{B as t}from"./helpers-C59q1dfa.js";const r=s.div`
  display: inline-flex;

  ${i=>n`
      font-size: ${i.size+i.padding}px;
      line-height: ${i.size}px;
    `}
`,d=s.div`
  display: inline-flex;

  ${i=>t.isSafari?n`
        font-size: ${i.size-4}px;
        line-height: 1;
      `:n`
      font-size: ${i.size-3}px;
      line-height: ${i.size}px;
    `}
`,o=()=>e.jsxs("div",{children:[e.jsx(r,{size:16,padding:4,children:"Hello World"}),e.jsx(d,{size:16,children:"Branched"})]});export{o as App,d as BranchedContainer,r as Container};
