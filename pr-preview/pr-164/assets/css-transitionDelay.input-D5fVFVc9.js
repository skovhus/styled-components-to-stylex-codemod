import{j as n,d as i}from"./index-B_Qk8Tgf.js";const s=i.div`
  opacity: ${t=>t.$open?1:0};
  transition: opacity 200ms ease-out;
  transition-delay: ${t=>t.$open?t.$delay:0}ms;
`;function a(t){const{children:o,...e}=t;return n.jsx(s,{...e,children:o})}const d=()=>n.jsx(a,{$open:!0,$delay:100,children:"Content"});export{d as App,a as AutoFadingContainer};
