import{j as t,c as e}from"./index-DHeQ_gfE.js";const s=e.div`
  padding: 16px;
  background: white;
  border: ${n=>n.highlighted?"2px solid blue":"1px solid gray"};
`,i=n=>{const{children:o,...r}=n;return t.jsx("button",{...r,children:o})},c=e(i)`
  padding: 0 2px;
  box-shadow: none;
`;function a(){return t.jsxs(t.Fragment,{children:[t.jsx(s,{title:"My Card",highlighted:!0,className:"custom-class",onClick:()=>{},children:"Card content"}),t.jsx(c,{"aria-label":"Close",$hoverStyles:!0,children:"X"})]})}export{a as App,s as Card,c as IconButton};
