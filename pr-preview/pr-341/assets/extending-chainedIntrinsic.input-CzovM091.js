import{r as a,j as t,c as e}from"./index-CGXea8Op.js";const o=20,d=4,p=4,c=e.div`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
`,n=e.div`
  position: absolute;
  pointer-events: none;
  display: flex;
  gap: ${d}px;
  align-items: center;
`,i=e.div`
  position: absolute;
  top: 0;
  bottom: 0;
`,r=e(i)`
  width: ${o}px;
  background: linear-gradient(to right, transparent, #f0f5ff);
`,x=e(i)`
  width: ${o}px;
  background: linear-gradient(to left, transparent, #f0f5ff);
`,f=e(r)`
  width: 10px;
`,h=e.div`
  position: absolute;
  top: -${p}px;
  height: 6px;
  border-right: 1px solid transparent;
  z-index: 1;
`;function j(){const l=a.useRef(null),s=50;return t.jsx("div",{style:{position:"relative",height:120,padding:16},children:t.jsxs(c,{children:[t.jsxs(n,{style:{height:24,left:10,width:100},children:[t.jsx("span",{children:"Label A"}),t.jsx(f,{style:{right:0}})]}),t.jsx(n,{ref:l,style:{opacity:0,zIndex:-1},children:t.jsx("span",{children:"Measure"})}),t.jsx(r,{style:{zIndex:1,left:s}}),t.jsx(x,{style:{left:s}}),t.jsx(h,{style:{left:40,borderRightColor:"#999"}})]})})}export{j as App};
