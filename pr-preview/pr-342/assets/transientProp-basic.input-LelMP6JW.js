import{j as t,c as o}from"./index-Gq3wqmKq.js";import{I as p}from"./icon-s_TiveaA.js";const s=o.div`
  color: red;
  cursor: ${e=>e.$draggable?"move":"pointer"};
`,x=({className:e,text:n,...r})=>t.jsx("a",{...r,className:e,children:n}),i=o(x)`
  color: ${e=>e.$red?"red":"blue"};
`,$=o.div`
  position: absolute;
  width: 12px;
  height: 8px;
  background-color: white;
`;function u(e){const{$isOpen:n,...r}=e;return t.jsx(p,{...r,children:t.jsx("svg",{viewBox:"0 0 16 16",children:t.jsx("path",{d:"M7 10.6L10.8 7.6L7 5.4V10.6Z"})})})}const d=o(u)`
  transform: rotate(${e=>e.$isOpen?"90deg":"0deg"});
  transition: transform 0.2s;
`,y=()=>t.jsxs("div",{children:[t.jsx(s,{$draggable:!0,children:"Draggable"}),t.jsx(s,{children:"Not Draggable"}),t.jsx(i,{text:"Click",$red:!0}),t.jsx(i,{text:"Click"}),t.jsx($,{$size:100,style:{top:"10px"},"data-testid":"point"}),t.jsx(d,{$isOpen:!0}),t.jsx(d,{$isOpen:!1}),t.jsx(h,{$direction:"up",$delay:.4}),t.jsx(m,{children:"Visible"}),t.jsx(g,{children:"Reversed"})]});function j(e){const{className:n,style:r,$direction:c,$delay:l}=e;return t.jsx("div",{className:n,"data-direction":c,"data-delay":l,style:r})}const h=o(j)`
  max-width: 90vw;
`,a=o.div`
  opacity: ${e=>e.$open?1:0};
  transition: opacity ${e=>e.$duration}ms;
  pointer-events: ${e=>e.$open?"inherit":"none"};
`;function m(e){const{children:n,...r}=e;return t.jsx(a,{...r,$open:!!n,$duration:350,children:n})}function g(e){const{children:n,...r}=e;return t.jsx(a,{$open:!!n,$duration:350,...r,children:n})}export{y as App,d as CollapseArrowIcon};
