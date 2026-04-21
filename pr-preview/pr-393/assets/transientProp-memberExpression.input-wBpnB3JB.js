import"./chunk-zsgVPwQN.js";import{t as e}from"./react-D4cBbUL-.js";import{f as t,s as n}from"./index-C4oB5tBj.js";import{n as r,t as i}from"./user-avatar-D9maLFFH.js";e();var a=t(),o=n(r.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?`8px`:`20px`};
  overflow: hidden;
`,s=n(i)`
  box-shadow: 0 0 0 2px ${e=>e.$highlightColor??`transparent`};
  border-radius: 50%;
`,c=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{$isOpen:!0,initial:{height:40},animate:{height:200},children:`Open content`}),(0,a.jsx)(o,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,a.jsx)(s,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,a.jsx)(s,{user:`Bob`,size:`tiny`})]});export{c as App};