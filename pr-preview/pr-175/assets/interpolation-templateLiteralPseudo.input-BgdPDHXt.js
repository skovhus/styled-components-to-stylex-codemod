import{j as e,c as r}from"./index-DHeQ_gfE.js";const t=r.div`
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
`,c=()=>e.jsxs("div",{children:[e.jsx(t,{$tone:"tomato",children:"Hover"}),e.jsx(i,{$tone:"plum",children:"Hover Media"})]});export{c as App};
