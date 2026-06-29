import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DkPMKgTf.js";t();var r=e(),i=n.div`
  padding: 16px;
  background: white;
  border: ${e=>e.highlighted?`2px solid blue`:`1px solid gray`};
`,a=n(e=>{let{children:t,...n}=e;return(0,r.jsx)(`button`,{...n,children:t})})`
  padding: 0 2px;
  box-shadow: none;
`;function o(){return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(i,{title:`My Card`,highlighted:!0,className:`custom-class`,onClick:()=>{},children:`Card content`}),(0,r.jsx)(a,{"aria-label":`Close`,$hoverStyles:!0,children:`X`})]})}export{o as App,i as Card,a as IconButton};