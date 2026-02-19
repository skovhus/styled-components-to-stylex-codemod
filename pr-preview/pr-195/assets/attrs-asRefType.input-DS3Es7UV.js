import{j as e,r as s,a as r}from"./index-LC5oshb-.js";const n=r.span`
  font-size: ${t=>t.variant==="large"?"18px":t.variant==="small"?"12px":"14px"};
`,a=r(n).attrs({as:"label"})`
  cursor: pointer;
  user-select: none;
`;function i(){const t=s.useRef(null);return e.jsxs("div",{children:[e.jsx(a,{ref:t,htmlFor:"input-id",variant:"regular",children:"Username"}),e.jsx("input",{id:"input-id",type:"text"})]})}const o=()=>e.jsx(i,{});export{o as App,i as FormField};
