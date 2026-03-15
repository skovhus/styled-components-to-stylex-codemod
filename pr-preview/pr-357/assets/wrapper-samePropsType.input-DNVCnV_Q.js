import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-CyUUxAP6.js";e(t(),1);var i=n(),a=r(r.div`
  display: flex;
  flex-direction: ${e=>e.column?`column`:`row`};
  gap: ${e=>e.gap?`${e.gap}px`:`0`};
`)`
  padding: 8px;
`,o=r.button`
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  font-size: ${e=>e.size?`${e.size}px`:`14px`};
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,i.jsx)(a,{column:!0,gap:8,style:{backgroundColor:`#f0f0f0`},children:`Wrapper with column and gap`}),(0,i.jsx)(o,{variant:`primary`,size:18,onClick:()=>alert(`clicked`),children:`Primary Button`}),(0,i.jsx)(o,{variant:`secondary`,children:`Secondary Button`})]})}export{s as App,o as Button,a as Wrapper};