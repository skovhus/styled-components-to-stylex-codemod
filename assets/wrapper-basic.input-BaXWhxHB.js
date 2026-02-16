import{j as e,r as t,a as n}from"./index-CfUWSoIu.js";function s(){const o=t.useRef(null),r=t.useRef(null);return e.jsx(i,{ref:o,tabIndex:-1,children:e.jsx("div",{ref:r,style:{height:200},children:"Scrollable content"})})}const i=n.div`
  /* Constrained height to show scroll */
  height: 60px;
  /* Fixed width */
  width: 160px;
  overflow-y: scroll; // This is important
  background-color: #f0f4f8;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
`,l=()=>e.jsx("div",{style:{padding:16},children:e.jsx(s,{})});export{l as App,s as SomeComponent};
