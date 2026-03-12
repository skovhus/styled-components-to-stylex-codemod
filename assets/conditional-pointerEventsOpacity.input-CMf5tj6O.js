import{j as e,c as t}from"./index-BzWYrzU2.js";import{F as o}from"./flex-C-pF_Dle.js";const i=t(o)`
  opacity: ${n=>n.$open?1:0};
  transition: opacity ${n=>n.$duration}ms;
  transition-delay: ${n=>n.$open?n.$delay:0}ms;
  pointer-events: ${n=>n.$open?"inherit":"none"};
`,d=()=>e.jsxs("div",{style:{display:"flex",gap:"16px"},children:[e.jsx(i,{$open:!0,$delay:100,$duration:300,children:e.jsx("button",{style:{padding:"8px 16px"},children:"Visible and clickable"})}),e.jsx(i,{$open:!1,$delay:0,$duration:200,children:e.jsx("button",{style:{padding:"8px 16px"},children:"Hidden and not clickable"})})]});export{d as App};
