import{j as t,a as r}from"./index-CzR8mRP1.js";import{I as l}from"./icon-BaQkNYrC.js";const n=r.div`
  color: red;
  cursor: ${e=>e.$draggable?"move":"pointer"};
`,x=({className:e,text:s,...o})=>t.jsx("a",{...o,className:e,children:s}),i=r(x)`
  color: ${e=>e.$red?"red":"blue"};
`,p=r.div`
  position: absolute;
  width: 12px;
  height: 8px;
  background-color: white;
`;function j(e){const{$isOpen:s,...o}=e;return t.jsx(l,{...o,children:t.jsx("svg",{viewBox:"0 0 16 16",children:t.jsx("path",{d:"M7 10.6L10.8 7.6L7 5.4V10.6Z"})})})}const a=r(j)`
  transform: rotate(${e=>e.$isOpen?"90deg":"0deg"});
  transition: transform 0.2s;
`,h=()=>t.jsxs("div",{children:[t.jsx(n,{$draggable:!0,children:"Draggable"}),t.jsx(n,{children:"Not Draggable"}),t.jsx(i,{text:"Click",$red:!0}),t.jsx(i,{text:"Click"}),t.jsx(p,{$size:100,style:{top:"10px"},"data-testid":"point"}),t.jsx(a,{$isOpen:!0}),t.jsx(a,{$isOpen:!1}),t.jsx(g,{$direction:"up",$delay:.4})]});function $(e){const{className:s,style:o,$direction:d,$delay:c}=e;return t.jsx("div",{className:s,"data-direction":d,"data-delay":c,style:o})}const g=r($)`
  max-width: 90vw;
`;export{h as App,a as CollapseArrowIcon};
