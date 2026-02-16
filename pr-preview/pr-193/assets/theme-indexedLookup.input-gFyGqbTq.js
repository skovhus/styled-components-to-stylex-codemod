import{j as e,a as l}from"./index-CfHtGZmL.js";const r=l.div`
  &:hover {
    background-color: ${o=>o.theme.color[o.$hoverColor]};
  }
  background-color: ${o=>o.theme.color[o.$bg]};
  width: 42px;
  height: 100%;
  padding: 16px;
`,a=()=>e.jsxs(e.Fragment,{children:[e.jsx(r,{$bg:"labelBase",$hoverColor:"labelMuted"}),e.jsx(r,{$bg:"labelMuted",$hoverColor:"labelBase"})]}),c=l.span`
  color: ${o=>o.theme.color[o.color]};
`;export{a as App,c as TextColor};
