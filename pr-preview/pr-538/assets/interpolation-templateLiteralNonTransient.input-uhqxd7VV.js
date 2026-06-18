import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DvP5zErB.js";var n=e(),r=t.div`
  padding: 8px;
  width: ${e=>`${e.size??100}px`};
  height: ${e=>`${e.size??100}px`};
  background-color: paleturquoise;
  border: 2px solid teal;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px;
`,i=t.div`
  width: ${e=>e.svgWidth?`${e.svgWidth}px`:`100%`};
  aspect-ratio: ${e=>o(e.svgWidth,e.svgHeight)};
  background-color: mistyrose;
  border: 2px solid crimson;
  display: flex;
  align-items: center;
  justify-content: center;
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`},children:[(0,n.jsx)(r,{size:150,children:`150x150`}),(0,n.jsx)(r,{size:100,children:`100x100`}),(0,n.jsx)(r,{children:`Default (100x100)`}),(0,n.jsx)(i,{svgWidth:160,svgHeight:90,children:`16:9 frame`}),(0,n.jsx)(i,{children:`Default frame`})]});function o(e,t){return e&&t?`${e} / ${t}`:`16 / 9`}export{a as App};