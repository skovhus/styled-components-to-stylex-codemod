import{j as e,c as l}from"./index-DHeQ_gfE.js";const r=l.div`
  &:hover {
    background-color: ${o=>o.theme.color[o.$hoverColor]};
  }
  background-color: ${o=>o.theme.color[o.$bg]};
  width: 42px;
  height: 100%;
  padding: 16px;
`,c=()=>e.jsxs(e.Fragment,{children:[e.jsx(r,{$bg:"labelBase",$hoverColor:"labelMuted"}),e.jsx(r,{$bg:"labelMuted",$hoverColor:"labelBase"})]}),a=l.span`
  color: ${o=>o.theme.color[o.color]};
`;export{c as App,a as TextColor};
