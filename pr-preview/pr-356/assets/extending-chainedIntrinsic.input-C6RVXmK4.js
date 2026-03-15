import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";var i=e(t(),1),a=n(),o=20,s=4,c=4,l=r.div`
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
`,u=r.div`
  position: absolute;
  pointer-events: none;
  display: flex;
  gap: ${s}px;
  align-items: center;
`,d=r.div`
  position: absolute;
  top: 0;
  bottom: 0;
`,f=r(d)`
  width: ${o}px;
  background: linear-gradient(to right, transparent, #f0f5ff);
`,p=r(d)`
  width: ${o}px;
  background: linear-gradient(to left, transparent, #f0f5ff);
`,m=r(f)`
  width: 10px;
`,h=r.div`
  position: absolute;
  top: -${c}px;
  height: 6px;
  border-right: 1px solid transparent;
  z-index: 1;
`;function g(){let e=i.useRef(null);return(0,a.jsx)(`div`,{style:{position:`relative`,height:120,padding:16},children:(0,a.jsxs)(l,{children:[(0,a.jsxs)(u,{style:{height:24,left:10,width:100},children:[(0,a.jsx)(`span`,{children:`Label A`}),(0,a.jsx)(m,{style:{right:0}})]}),(0,a.jsx)(u,{ref:e,style:{opacity:0,zIndex:-1},children:(0,a.jsx)(`span`,{children:`Measure`})}),(0,a.jsx)(f,{style:{zIndex:1,left:50}}),(0,a.jsx)(p,{style:{left:50}}),(0,a.jsx)(h,{style:{left:40,borderRightColor:`#999`}})]})})}export{g as App};