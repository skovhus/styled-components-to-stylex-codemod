import{j as e,d as r}from"./index-JQ2tgM-p.js";const t=r.div`
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
`,d=()=>e.jsxs("div",{children:[e.jsx(t,{$tone:"tomato",children:"Hover"}),e.jsx(i,{$tone:"plum",children:"Hover Media"})]});export{d as App};
