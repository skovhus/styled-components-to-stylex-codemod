import{r,j as n,c as o}from"./index-FP_Cx-M0.js";const l={span:r.forwardRef((e,t)=>n.jsx("span",{ref:t,...e,style:e.style}))},i=o.span`
  font-variant-numeric: tabular-nums;
  overflow: visible;
  display: inline-flex;
`;function c(e){const{width:t,children:s}=e,a=r.useRef(null);return typeof t!="number"?n.jsx(i,{as:l.span,ref:a,style:{width:t},children:s}):n.jsx(i,{ref:a,style:{width:t},children:s})}const d=()=>n.jsx(c,{width:100,children:"42"});export{c as AnimatedNumber,d as App};
