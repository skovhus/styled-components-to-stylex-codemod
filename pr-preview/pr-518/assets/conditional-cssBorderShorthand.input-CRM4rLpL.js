import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n,p as r}from"./index-CmA9BOyl.js";r();var i=e(),a=n.div`
  border-top: 1px solid ${e=>e.theme.color.bgBorderFaint};
  ${e=>!e.$hideBottomBorder&&t`
      border-bottom: 1px solid ${e.theme.color.bgBorderFaint};
    `}
  padding: 8px;
`,o=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Default (has bottom border)`}),(0,i.jsx)(a,{$hideBottomBorder:!0,children:`No bottom border`})]});export{o as App};