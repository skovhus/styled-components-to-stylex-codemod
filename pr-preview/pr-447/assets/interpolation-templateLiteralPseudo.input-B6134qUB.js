import{c as e,p as t}from"./index-B4IKwpAR.js";var n=t(),r=e.div`
  display: inline-block;

  &:hover {
    color: ${e=>`var(--tone, ${e.$tone})`};
  }
`,i=e.div`
  display: inline-block;

  &:hover {
    @media (hover: hover) {
      color: ${e=>`var(--tone, ${e.$tone})`};
    }
  }
`,a=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{$tone:`tomato`,children:`Hover`}),(0,n.jsx)(i,{$tone:`plum`,children:`Hover Media`})]});export{a as App};