import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-BuqP2aek.js";n();var r=e(),i=t(`span`)`
  color: ${e=>e.color};
`,a=t(e=>(0,r.jsx)(`span`,{...e}))`
  background: ${e=>e.highlighted?`yellow`:`transparent`};
`;function o(){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i,{color:`red`,className:`custom`,style:{fontSize:14},children:`Red text`}),(0,r.jsx)(a,{highlighted:!0,className:`highlight`,children:`Highlighted text`})]})}var s=t(`span`)`
  color: ${e=>e.theme.color[e.themeColor]};
`;export{o as App,a as Highlight,i as TextColor,s as ThemeText};