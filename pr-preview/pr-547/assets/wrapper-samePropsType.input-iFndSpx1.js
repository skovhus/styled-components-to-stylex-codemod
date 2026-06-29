import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BRzmqM0U.js";t();var r=e(),i=n(n.div`
  display: flex;
  flex-direction: ${e=>e.column?`column`:`row`};
  gap: ${e=>e.gap?`${e.gap}px`:`0`};
`)`
  padding: 8px;
`,a=n.button`
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  font-size: ${e=>e.size?`${e.size}px`:`14px`};
`;function o(){return(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,r.jsx)(i,{column:!0,gap:8,style:{backgroundColor:`#f0f0f0`},children:`Wrapper with column and gap`}),(0,r.jsx)(a,{variant:`primary`,size:18,onClick:()=>alert(`clicked`),children:`Primary Button`}),(0,r.jsx)(a,{variant:`secondary`,children:`Secondary Button`})]})}export{o as App,a as Button,i as Wrapper};