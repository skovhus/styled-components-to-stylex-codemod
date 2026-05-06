import{o as e}from"./chunk-jRWAZmH_.js";import{c as t,m as n,p as r}from"./index-DDUSP3M2.js";var i=e(n(),1),a=r(),o=20,s=4,c=4,l=t.div`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
`,u=t.div`
  position: absolute;
  pointer-events: none;
  display: flex;
  gap: ${s}px;
  align-items: center;
`,d=t.div`
  position: absolute;
  top: 0;
  bottom: 0;
`,f=t(d)`
  width: ${o}px;
  background: linear-gradient(to right, transparent, #f0f5ff);
`,p=t(d)`
  width: ${o}px;
  background: linear-gradient(to left, transparent, #f0f5ff);
`,m=t(f)`
  width: 10px;
`,h=t.div`
  position: absolute;
  top: -${c}px;
  height: 6px;
  border-right: 1px solid transparent;
  z-index: 1;
`;function g(){let e=i.useRef(null);return(0,a.jsx)(`div`,{style:{position:`relative`,height:120,padding:16},children:(0,a.jsxs)(l,{children:[(0,a.jsxs)(u,{style:{height:24,left:10,width:100},children:[(0,a.jsx)(`span`,{children:`Label A`}),(0,a.jsx)(m,{style:{right:0}})]}),(0,a.jsx)(u,{ref:e,style:{opacity:0,zIndex:-1},children:(0,a.jsx)(`span`,{children:`Measure`})}),(0,a.jsx)(f,{style:{zIndex:1,left:50}}),(0,a.jsx)(p,{style:{left:50}}),(0,a.jsx)(h,{style:{left:40,borderRightColor:`#999`}})]})})}export{g as App};