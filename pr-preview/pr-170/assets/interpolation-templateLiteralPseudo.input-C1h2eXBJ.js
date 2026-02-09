import{j as e,a as r}from"./index-B8XlG4jc.js";const t=r.div`
  display: inline-block;

  &:hover {
    color: ${o=>`var(--tone, ${o.$tone})`};
  }
`,i=r.div`
  display: inline-block;

  &:hover {
    @media (hover: hover) {
      color: ${o=>`var(--tone, ${o.$tone})`};
    }
  }
`,a=()=>e.jsxs("div",{children:[e.jsx(t,{$tone:"tomato",children:"Hover"}),e.jsx(i,{$tone:"plum",children:"Hover Media"})]});export{a as App};
