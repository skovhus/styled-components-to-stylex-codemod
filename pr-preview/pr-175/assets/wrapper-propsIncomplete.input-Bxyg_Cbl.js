import{j as e,c as o}from"./index-DHeQ_gfE.js";const s=o("span")`
  color: ${t=>t.color};
`,r=t=>e.jsx("span",{...t}),l=o(r)`
  background: ${t=>t.highlighted?"yellow":"transparent"};
`;function h(){return e.jsxs(e.Fragment,{children:[e.jsx(s,{color:"red",className:"custom",style:{fontSize:14},children:"Red text"}),e.jsx(l,{highlighted:!0,className:"highlight",children:"Highlighted text"})]})}const n=o("span")`
  color: ${t=>t.theme.color[t.themeColor]};
`;export{h as App,l as Highlight,s as TextColor,n as ThemeText};
