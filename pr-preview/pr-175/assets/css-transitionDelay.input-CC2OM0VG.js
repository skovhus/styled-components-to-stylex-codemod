import{j as n,c as i}from"./index-DHeQ_gfE.js";const s=i.div`
  opacity: ${t=>t.$open?1:0};
  transition: opacity 200ms ease-out;
  transition-delay: ${t=>t.$open?t.$delay:0}ms;
`;function a(t){const{children:o,...e}=t;return n.jsx(s,{...e,children:o})}const c=()=>n.jsx(a,{$open:!0,$delay:100,children:"Content"});export{c as App,a as AutoFadingContainer};
