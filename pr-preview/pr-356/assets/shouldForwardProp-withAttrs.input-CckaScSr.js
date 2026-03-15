import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BFw42tS8.js";var n=e(),r=t(`span`).withConfig({shouldForwardProp:e=>![`align`,`selectable`].includes(e)}).attrs(e=>({align:e.align??`left`,selectable:e.selectable??!1}))`
  font-style: normal;
  ${e=>e.align?`text-align: ${e.align};`:``}
  ${e=>e.selectable?`user-select: text;`:``};
`;function i(){return(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,n.jsx)(r,{children:`Default left, not selectable`}),(0,n.jsx)(r,{align:`center`,children:`Centered`}),(0,n.jsx)(r,{selectable:!0,children:`Selectable`})]})}export{i as App,r as Text};