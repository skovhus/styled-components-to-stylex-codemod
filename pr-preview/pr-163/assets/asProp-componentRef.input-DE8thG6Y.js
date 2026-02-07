import{j as n,r,d as o}from"./index-Cx_8Apnd.js";const l={span:r.forwardRef((e,t)=>n.jsx("span",{ref:t,...e,style:e.style}))},i=o.span`
  font-variant-numeric: tabular-nums;
  overflow: visible;
  display: inline-flex;
`;function d(e){const{width:t,children:s}=e,a=r.useRef(null);return typeof t!="number"?n.jsx(i,{as:l.span,ref:a,style:{width:t},children:s}):n.jsx(i,{ref:a,style:{width:t},children:s})}const c=()=>n.jsx(d,{width:100,children:"42"});export{d as AnimatedNumber,c as App};
