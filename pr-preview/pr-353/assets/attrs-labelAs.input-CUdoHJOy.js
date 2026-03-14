import{j as e,r as n,c as r}from"./index-C5BAxBUb.js";const s=r.span`
  font-size: ${t=>t.variant==="large"?"18px":t.variant==="small"?"12px":"14px"};
  line-height: 1.5;
`,a=r(s).attrs({as:"label"})`
  cursor: pointer;
  user-select: none;
`;function i(){const t=n.useRef(null);return e.jsxs("div",{children:[e.jsx(a,{ref:t,htmlFor:"input-id",variant:"regular",children:"Username"}),e.jsx("input",{id:"input-id",type:"text"})]})}const o=()=>e.jsx(i,{});export{o as App,i as FormField,a as Label};
