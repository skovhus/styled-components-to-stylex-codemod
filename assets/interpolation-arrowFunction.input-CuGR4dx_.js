import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-Dda2rlA_.js";e(t(),1);var i=n(),a=r.div`
  background: ${e=>e.$direction===`horizontal`?`linear-gradient(90deg, #bf4f74, #3498db)`:`linear-gradient(180deg, #bf4f74, #3498db)`};
  padding: 24px;
`,o=r.div`
  padding: 12px 16px;
  border-bottom: ${e=>e.$isActive?`2px solid #bf4f74`:`2px solid transparent`};
  cursor: pointer;
`,s=r.div`
  position: absolute;
  left: 10px;
  bottom: ${e=>e.$large?80:20}px;
  padding: 12px 16px;
  background-color: paleturquoise;
  border: 2px solid teal;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{$direction:`horizontal`,children:`Horizontal Gradient`}),(0,i.jsx)(o,{$isActive:!0,children:`Active Tab`}),(0,i.jsx)(o,{children:`Inactive Tab`}),(0,i.jsxs)(`div`,{style:{position:`relative`,height:`200px`},children:[(0,i.jsx)(s,{$large:!0,children:`Large Box (bottom: 80px)`}),(0,i.jsx)(s,{style:{left:200},children:`Small Box (bottom: 20px)`})]})]});export{c as App};