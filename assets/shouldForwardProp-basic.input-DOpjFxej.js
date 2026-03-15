import"./react-D4cBbUL-.js";import{d as e,f as t,s as n}from"./index-Dda2rlA_.js";var r=t(),i=n.button.withConfig({shouldForwardProp:e=>![`color`,`size`].includes(e)})`
  background: ${e=>e.color||`#BF4F74`};
  padding: ${e=>e.size===`large`?`12px 24px`:`8px 16px`};
  font-size: ${e=>e.size===`large`?`18px`:`14px`};
  color: white;
  border: none;
  border-radius: 4px;
`,a=n.a.withConfig({shouldForwardProp:t=>e(t)&&t!==`isActive`})`
  color: ${e=>e.isActive?`#BF4F74`:`#333`};
  font-weight: ${e=>e.isActive?`bold`:`normal`};
  text-decoration: none;

  &:hover {
    color: #BF4F74;
  }
`,o=n.div.withConfig({shouldForwardProp:e=>!e.startsWith(`$`)})`
  background: ${e=>e.$background||`white`};
  padding: ${e=>e.$padding||`16px`};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`,s=n.div`
  background: ${e=>e.$color??`#e0e0e0`};
  padding: 16px;
`,c=n.div.withConfig({shouldForwardProp:e=>![`variant`,`elevation`,`rounded`].includes(e)})`
  background: ${e=>e.variant===`primary`?`#BF4F74`:`#4F74BF`};
  box-shadow: ${e=>`0 ${(e.elevation||1)*2}px ${(e.elevation||1)*4}px rgba(0, 0, 0, 0.8)`};
  border-radius: ${e=>e.rounded?`16px`:`4px`};
  padding: 16px;
  color: white;
`,l=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{color:`#4CAF50`,size:`large`,children:`Large Green Button`}),(0,r.jsx)(i,{children:`Default Button`}),(0,r.jsx)(`br`,{}),(0,r.jsx)(a,{href:`#`,isActive:!0,children:`Active Link`}),(0,r.jsx)(a,{href:`#`,children:`Normal Link`}),(0,r.jsx)(`br`,{}),(0,r.jsx)(o,{$background:`#f0f0f0`,$padding:`24px`,children:`Box with transient-like props`}),(0,r.jsx)(s,{$color:`#bf4f74`,children:`Nullish Coalescing Box`}),(0,r.jsx)(c,{variant:`primary`,elevation:3,rounded:!0,children:`Elevated Card`})]});export{l as App};