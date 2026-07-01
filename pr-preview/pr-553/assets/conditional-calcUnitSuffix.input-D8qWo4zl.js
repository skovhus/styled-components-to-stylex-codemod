import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-CnAB2IxS.js";var n=e(),r=40,i=t.div`
  height: ${e=>e.$collapsed?`calc(${r}px + 8px)`:r}px;
  background-color: lightblue;
`,a=t.div`
  width: ${e=>e.$wide?`calc(100% - ${e.$size}px)`:e.$size}px;
  background-color: lightgreen;
`,o=t.div`
  height: ${e=>e.$big?`calc(40px + 8px)`:40}px;
  background-color: khaki;
`,s=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,gap:`8px`},children:[(0,n.jsx)(i,{$collapsed:!1,children:`Header height`}),(0,n.jsx)(a,{$wide:!1,$size:48,children:`Fixed size`}),(0,n.jsx)(o,{$big:!1,children:`Toggle`})]});export{s as App,i as Panel,a as Spacer,o as Toggle};