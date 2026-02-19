import{j as n,a}from"./index-DNDr55Fx.js";const i=a.div`
  opacity: ${t=>t.$open?1:0};
  transition: opacity 200ms ease-out;
  transition-delay: ${t=>t.$open?t.$delay:0}ms;
`;function s(t){const{children:o,...e}=t;return n.jsx(i,{...e,children:o})}const c=()=>n.jsx(s,{$open:!0,$delay:100,children:"Content"});export{c as App,s as AutoFadingContainer};
