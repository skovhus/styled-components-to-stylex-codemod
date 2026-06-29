import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-D50K3hv9.js";t();var r=e(),i=n(`span`)`
  color: ${e=>e.color};
`,a=n(e=>(0,r.jsx)(`span`,{...e}))`
  background: ${e=>e.highlighted?`yellow`:`transparent`};
`;function o(){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i,{color:`red`,className:`custom`,style:{fontSize:14},children:`Red text`}),(0,r.jsx)(a,{highlighted:!0,className:`highlight`,children:`Highlighted text`})]})}var s=n(`span`)`
  color: ${e=>e.theme.color[e.themeColor]};
`;export{o as App,a as Highlight,i as TextColor,s as ThemeText};