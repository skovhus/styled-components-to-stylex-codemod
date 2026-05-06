import{c as e,p as t}from"./index-CAZQsAq0.js";var n=t(),r=e.button.withConfig({shouldForwardProp:e=>!e.startsWith(`$`)})`
  background: ${e=>e.$variant===`primary`?`#BF4F74`:`#4F74BF`};
  color: white;
  padding: 8px 16px;
`,i=e.button.withConfig({shouldForwardProp:e=>![`customProp`,`anotherProp`].includes(e)})`
  background: ${e=>e.customProp||`#BF4F74`};
  padding: ${e=>(e.anotherProp||16)+`px`};
  color: white;
`,a=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{$variant:`primary`,children:`Primary`}),(0,n.jsx)(i,{customProp:`#4CAF50`,anotherProp:24,children:`Custom`})]});export{a as App,i as ExplicitFilterButton,r as TransientButton};